using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Datamint.Domain.Entities;
using Datamint.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Datamint.API.Controllers;

/// <summary>
/// A user's saved, reusable field-name sets for "Formatted" extraction mode - lets someone who
/// repeatedly uploads the same kind of document pick a saved list from the upload page instead
/// of retyping the same field names every time. Always scoped to the caller's own account -
/// there's no sharing/anonymous concept here, so ownership is just a plain UserId filter rather
/// than the owner-vs-404 dance Document endpoints need for shareable links.
/// </summary>
[ApiController]
[Route("api/field-templates")]
[Authorize]
public class FieldTemplatesController : ControllerBase
{
    private readonly DatamintDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;

    public FieldTemplatesController(DatamintDbContext db, ICurrentUserService currentUser, IAuditService audit)
    {
        _db = db;
        _currentUser = currentUser;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var templates = await _db.FieldTemplates
            .Where(t => t.UserId == userId)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        return Ok(new { success = true, templates = templates.Select(ToDto) });
    }

    [HttpPost]
    public async Task<IActionResult> Create(SaveFieldTemplateRequestDto dto, CancellationToken ct)
    {
        var (name, fields, error) = Validate(dto);
        if (error is not null) return error;

        var userId = _currentUser.UserId!.Value;
        var template = new FieldTemplate { UserId = userId, Name = name!, Fields = string.Join(",", fields!) };
        _db.FieldTemplates.Add(template);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("FieldTemplate.Created", userId, "FieldTemplate", template.Id.ToString(), $"{{\"name\":\"{template.Name}\"}}", true, ct);

        return Ok(new { success = true, template = ToDto(template) });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, SaveFieldTemplateRequestDto dto, CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var template = await _db.FieldTemplates.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId, ct);
        if (template is null) return NotFound(new { success = false, message = "Template not found." });

        var (name, fields, error) = Validate(dto);
        if (error is not null) return error;

        template.Name = name!;
        template.Fields = string.Join(",", fields!);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("FieldTemplate.Updated", userId, "FieldTemplate", template.Id.ToString(), $"{{\"name\":\"{template.Name}\"}}", true, ct);

        return Ok(new { success = true, template = ToDto(template) });
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = _currentUser.UserId!.Value;
        var template = await _db.FieldTemplates.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId, ct);
        if (template is null) return NotFound(new { success = false, message = "Template not found." });

        template.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("FieldTemplate.Deleted", userId, "FieldTemplate", template.Id.ToString(), $"{{\"name\":\"{template.Name}\"}}", true, ct);

        return Ok(new { success = true });
    }

    private (string? Name, List<string>? Fields, IActionResult? Error) Validate(SaveFieldTemplateRequestDto dto)
    {
        var name = dto.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return (null, null, BadRequest(new { success = false, message = "Give this template a name." }));

        var fields = (dto.Fields ?? new List<string>()).Select(f => f.Trim()).Where(f => f.Length > 0).Distinct().ToList();
        if (fields.Count == 0)
            return (null, null, BadRequest(new { success = false, message = "Add at least one field." }));

        return (name, fields, null);
    }

    private static FieldTemplateDto ToDto(FieldTemplate t) => new(
        t.Id, t.Name,
        t.Fields.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList(),
        t.CreatedAtUtc, t.UpdatedAtUtc);
}
