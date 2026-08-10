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
using Microsoft.OpenApi.Models;
using Serilog;

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

// Backs OAuthService's short-lived authorization-code replay cache (see IOAuthService).
builder.Services.AddMemoryCache();

// ---------- Repositories ----------
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IOAuthClientRepository, OAuthClientRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));

// ---------- Infrastructure services (swap implementations here only) ----------
builder.Services.AddScoped<IEmailService, MailKitEmailService>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IGoogleAuthService, GoogleAuthService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<IAuthNotificationService, AuthNotificationService>();
builder.Services.AddScoped<IPasswordResetService, PasswordResetService>();
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IAvatarImageService, AvatarImageService>();
builder.Services.AddScoped<IOAuthService, OAuthService>();
builder.Services.AddScoped<IPdfTextExtractionService, PdfTextExtractionService>();
builder.Services.AddScoped<IPageImageRenderingService, PdfPageImageRenderingService>();
builder.Services.AddScoped<IExcelExportService, ExcelExportService>();
builder.Services.AddScoped<IJsonExportService, JsonExportService>();
builder.Services.AddScoped<IExtractionTierResolver, ExtractionTierResolver>();
builder.Services.AddScoped<IAiFieldExtractionServiceFactory, AiFieldExtractionServiceFactory>();
// Both AI providers are registered concretely (not behind the shared interface) since which one
// answers a given document is now a per-call decision (see ExtractionTier/IExtractionTierResolver),
// not a static config switch - IAiFieldExtractionServiceFactory picks between them at call time.
// Explicit timeout: multimodal extraction (page images) plus the bounded empty-result retry loop
// can turn one call pair into several sequential image-laden requests on this inline, synchronous
// upload path - the default 100s HttpClient timeout isn't generous enough headroom for that.
builder.Services.AddHttpClient<ClaudeFieldExtractionService>(c => c.Timeout = TimeSpan.FromSeconds(240));
builder.Services.AddHttpClient<OpenAiFieldExtractionService>(c => c.Timeout = TimeSpan.FromSeconds(240));
builder.Services.AddScoped<Datamint.Application.Services.DocumentProcessingService>();
builder.Services.AddScoped<IContactNotificationService, ContactNotificationService>();
builder.Services.AddScoped<IBillingNotificationService, BillingNotificationService>();
// Payment gateway is a config switch, same pattern as AiProvider: set "Payment:Provider" to
// "Fake" (default - simulates the whole flow locally, no credentials needed) or a real gateway
// name in appsettings.
var paymentProvider = builder.Configuration["Payment:Provider"] ?? "Fake";
if (string.Equals(paymentProvider, "Fake", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<IPaymentService, FakePaymentService>();
}
else
{
    throw new InvalidOperationException($"Unknown Payment:Provider '{paymentProvider}'. Only 'Fake' is currently implemented.");
}

// Sweeps deactivated accounts past their DeactivationGraceDays window and erases them.
builder.Services.AddHostedService<Datamint.Infrastructure.Services.AccountPurgeService>();

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
            var db = context.HttpContext.RequestServices.GetRequiredService<DatamintDbContext>();

            // Every OAuth2-issued access token (client_credentials or user-delegated
            // authorization_code) carries a client_id claim - checked live so disabling an
            // OAuth client kills its outstanding tokens immediately, the same
            // immediate-revocation philosophy the security-stamp check below already applies
            // to disabling a user. This runs in ADDITION to the user check, not instead of it,
            // for a user-delegated token (which has both claims).
            var clientIdClaim = context.Principal?.FindFirstValue(JwtClaimTypes.OAuthClientId);
            if (clientIdClaim is not null)
            {
                var client = await db.OAuthClients.FirstOrDefaultAsync(c => c.ClientId == clientIdClaim);
                if (client is null || !client.IsEnabled)
                {
                    context.Fail("This OAuth client is no longer valid.");
                    return;
                }
            }

            // The default JWT inbound claim mapping rewrites the short "sub" claim to
            // the long ClaimTypes.NameIdentifier URI, so it has to be looked up the
            // same dual way CurrentUserService already does elsewhere in this app.
            var userIdClaim = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                               ?? context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);

            // A client_credentials token has no "sub" at all - there's no user behind it, so
            // there's nothing further to check once the client itself has been confirmed valid
            // above.
            if (userIdClaim is null) return;

            var stampClaim = context.Principal?.FindFirstValue(JwtClaimTypes.SecurityStamp);

            if (!Guid.TryParse(userIdClaim, out var userId))
            {
                context.Fail("Invalid token.");
                return;
            }

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
        // Lets any future enum bind from/serialize to its string name instead of the
        // default numeric index - matches the string literal types used on the Angular side.
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    // Adds the "Authorize" padlock button: paste "Bearer <access token>" once (get one from
    // POST /api/auth/login below) and Swagger attaches it to every subsequent [Authorize] call.
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter 'Bearer' followed by a space and your access token, e.g. \"Bearer eyJhbGciOi...\""
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });

    // Second, alternative way to authorize: this app's own OAuth2 Authorization Server, using
    // Authorization Code + PKCE (RFC 7636) - not the deprecated Implicit flow. Swagger's
    // Authorize button opens /oauth/login (real login + consent UI) in a popup; on success the
    // popup redirects itself through /oauth/authorize/complete and then to Swagger's own
    // oauth2-redirect.html, which exchanges the code for a token at /oauth/token (with the
    // code_verifier swagger-ui generated itself via OAuthUsePkce() below) and applies it -
    // no client secret ever appears anywhere in this flow.
    options.AddSecurityDefinition("OAuth2", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.OAuth2,
        Flows = new OpenApiOAuthFlows
        {
            AuthorizationCode = new OpenApiOAuthFlow
            {
                AuthorizationUrl = new Uri("/oauth/authorize", UriKind.Relative),
                TokenUrl = new Uri("/oauth/token", UriKind.Relative),
                Scopes = new Dictionary<string, string>
                {
                    ["profile"] = "View your profile",
                    ["api.access"] = "Access the API on your behalf"
                }
            }
        },
        Description = "Sign in with your Datamint email and password - opens a login page, then authorizes automatically."
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "OAuth2" } },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// ---------- Auto-migrate + seed on startup (dev convenience; disable for prod CI/CD) ----------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DatamintDbContext>();
    await DbSeeder.SeedAsync(db, app.Configuration);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        // Pre-fills the Authorization Code flow's client_id with the built-in public client
        // DbSeeder seeds on startup, so the Authorize dialog never has to ask for one.
        options.OAuthClientId(DbSeeder.SwaggerClientId);
        // swagger-ui generates its own code_verifier/code_challenge (S256) and carries it
        // through the whole flow automatically - this is what makes PKCE work for a public
        // client with zero manual steps.
        options.OAuthUsePkce();
    });
}

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseHttpsRedirection();
app.UseCors("DatamintFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok()).AllowAnonymous();

app.Run();
