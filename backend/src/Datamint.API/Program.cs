using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using Datamint.API.Json;
using Datamint.API.Middleware;
using Datamint.Application.Interfaces;
using Datamint.Application.Services;
using Datamint.Infrastructure.Identity;
using Datamint.Infrastructure.Persistence;
using Datamint.Infrastructure.Persistence.Seed;
using Datamint.Infrastructure.Repositories;
using Datamint.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;

// QuestPDF requires an explicit license declaration in code as of v2023+. Community is free
// for orgs/individuals under $1M USD annual gross revenue (also free for open source) - see
// https://www.questpdf.com/license/ before this app is generating real revenue, a
// Professional/Enterprise license would be needed instead.
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

// ---------- Serilog: file + SQL Server sink so logs are queryable in prod ----------
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/datamint-.log", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
    .CreateLogger();
builder.Host.UseSerilog();

// ---------- EF Core / SQL Server ----------
builder.Services.AddDbContext<DatamintDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// ---------- Repositories ----------
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));

// ---------- Application services ----------
builder.Services.AddScoped<DocumentProcessingService>();

// ---------- Infrastructure services (swap implementations here only) ----------
builder.Services.AddScoped<IPdfTextExtractionService, PdfTextExtractionService>();
builder.Services.AddScoped<IImageOcrExtractionService, ImageOcrExtractionService>();
builder.Services.AddScoped<IPageImageRenderingService, PdfPageImageRenderingService>();

// AI field-extraction provider is a config switch: set "AiProvider:Provider" to
// "Claude" (default) or "OpenAI" in appsettings — nothing else in the app needs
// to change. Both providers use the same DocumentProcessingService/interface.
// Explicit timeout: multimodal extraction (page images) plus the bounded empty-result
// retry loop can turn one call pair into several sequential image-laden requests on this
// inline, synchronous upload path - the default 100s HttpClient timeout isn't generous
// enough headroom for that worst case.
var aiProvider = builder.Configuration["AiProvider:Provider"] ?? "Claude";
if (string.Equals(aiProvider, "OpenAI", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddHttpClient<IAiFieldExtractionService, OpenAiFieldExtractionService>(c => c.Timeout = TimeSpan.FromSeconds(240));
}
else
{
    builder.Services.AddHttpClient<IAiFieldExtractionService, ClaudeFieldExtractionService>(c => c.Timeout = TimeSpan.FromSeconds(240));
}

builder.Services.AddScoped<IEmailService, MailKitEmailService>();
builder.Services.AddScoped<IExcelExportService, ExcelExportService>();
builder.Services.AddScoped<IJsonExportService, JsonExportService>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IGoogleAuthService, GoogleAuthService>();
// Payment gateway is a config switch, same pattern as AiProvider:Provider above: set
// "Payment:Provider" to "Fake" (default - simulates the whole flow locally, no credentials
// needed) or "Razorpay" (real payment, needs Razorpay:KeyId/KeySecret) in appsettings.
var paymentProvider = builder.Configuration["Payment:Provider"] ?? "Fake";
if (string.Equals(paymentProvider, "Razorpay", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<IPaymentService, RazorpayPaymentService>();
}
else
{
    builder.Services.AddScoped<IPaymentService, FakePaymentService>();
}
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<IAuthNotificationService, AuthNotificationService>();
builder.Services.AddScoped<IBillingNotificationService, BillingNotificationService>();
builder.Services.AddScoped<IInvoicePdfService, InvoicePdfService>();
builder.Services.AddScoped<IPasswordResetService, PasswordResetService>();
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAvatarImageService, AvatarImageService>();

// Sweeps deactivated accounts past their DeactivationGraceDays window and erases them.
builder.Services.AddHostedService<Datamint.Infrastructure.Services.AccountPurgeService>();
// Warns users a few days before their plan's EndAtUtc, and follows up on checkouts that
// were started (an order/PaymentTransaction created) but never completed.
builder.Services.AddHostedService<Datamint.Infrastructure.Services.PlanExpiryAlertService>();
builder.Services.AddHostedService<Datamint.Infrastructure.Services.AbandonedCheckoutFollowUpService>();

// ---------- Current user (claims wrapper) ----------
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();

// ---------- JWT auth ----------
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
    };

    // A JWT is normally only self-invalidating (it just expires) - this adds a
    // live DB check so a password change/reset or an admin disabling/deleting
    // the account kills every access token for that user immediately, not just
    // at its natural ~30 min expiry.
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async context =>
        {
            // The default JWT inbound claim mapping rewrites the short "sub" claim to
            // the long ClaimTypes.NameIdentifier URI, so it has to be looked up the
            // same dual way CurrentUserService already does elsewhere in this app.
            var userIdClaim = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                               ?? context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);
            var stampClaim = context.Principal?.FindFirstValue(JwtClaimTypes.SecurityStamp);

            if (!Guid.TryParse(userIdClaim, out var userId))
            {
                context.Fail("Invalid token.");
                return;
            }

            var db = context.HttpContext.RequestServices.GetRequiredService<DatamintDbContext>();
            var user = await db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId);

            if (user is null || user.IsDeleted || !user.IsActive || user.SecurityStamp != stampClaim)
                context.Fail("This session is no longer valid. Please sign in again.");
        }
    };
});
builder.Services.AddAuthorization();

// ---------- CORS: only the Angular origin(s) listed in config ----------
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? new[] { "https://localhost:4200" };
builder.Services.AddCors(options =>
{
    options.AddPolicy("DatamintFrontend", policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
        options.JsonSerializerOptions.Converters.Add(new UtcNullableDateTimeConverter());
        // Lets ExportOptionsDto.Format/Layout (and any other enum) bind from/serialize to
        // their string names ("Json", "ColumnsPerField") instead of the default numeric index -
        // matches the string literal types already used on the Angular side.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// ---------- Auto-migrate + seed on startup (dev convenience; disable for prod CI/CD) ----------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();
    await DbSeeder.SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseHttpsRedirection();
app.UseCors("DatamintFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
