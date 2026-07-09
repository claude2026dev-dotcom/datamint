using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Datamint.Infrastructure.Services;

public class PasswordResetService : IPasswordResetService
{
    private const int TokenValidityHours = 1;

    private readonly DatamintDbContext _db;
    private readonly IJwtTokenService _jwt;

    public PasswordResetService(DatamintDbContext db, IJwtTokenService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<string> CreateResetTokenAsync(Guid userId, CancellationToken ct = default)
    {
        var previousTokens = await _db.PasswordResetTokens
            .Where(t => t.UserId == userId && !t.Used).ToListAsync(ct);
        foreach (var previous in previousTokens) previous.Used = true;

        var rawToken = _jwt.GenerateRefreshToken();
        _db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = userId,
            Token = _jwt.HashToken(rawToken),
            ExpiresAtUtc = DateTime.UtcNow.AddHours(TokenValidityHours)
        });
        await _db.SaveChangesAsync(ct);

        return rawToken;
    }

    public async Task<ApplicationUser?> ValidateAndConsumeAsync(string rawToken, CancellationToken ct = default)
    {
        var tokenHash = _jwt.HashToken(rawToken);
        var stored = await _db.PasswordResetTokens.Include(t => t.User)
            .FirstOrDefaultAsync(t => t.Token == tokenHash, ct);

        if (stored is null || stored.Used || stored.ExpiresAtUtc < DateTime.UtcNow)
            return null;

        stored.Used = true;
        await _db.SaveChangesAsync(ct);
        return stored.User;
    }
}
