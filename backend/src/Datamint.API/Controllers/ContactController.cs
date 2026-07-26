using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Datamint.API.Controllers;

/// <summary>Public "contact us" lead-capture form - forwards the message to the configured
/// support inbox (App:ContactEmail) for manual follow-up. Anonymous-friendly since a prospect
/// asking a question is, by definition, not signed in yet.</summary>
[ApiController]
[Route("api/contact")]
public class ContactController : ControllerBase
{
    private readonly IContactNotificationService _contact;
    private readonly IAuditService _audit;
    private readonly ICurrentUserService _currentUser;

    public ContactController(IContactNotificationService contact, IAuditService audit, ICurrentUserService currentUser)
    {
        _contact = contact;
        _audit = audit;
        _currentUser = currentUser;
    }

    [HttpPost]
    [AllowAnonymous]
    public async Task<IActionResult> Submit(ContactRequestDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Message))
            return BadRequest(new { success = false, message = "Please fill in your name, email, and message." });

        var sent = await _contact.SendContactMessageAsync(dto.Name.Trim(), dto.Email.Trim(), dto.Message.Trim(), ct);
        await _audit.LogAsync("Contact.MessageSubmitted", _currentUser.UserId, details: $"{{\"email\":\"{dto.Email.Trim()}\"}}", isSuccess: sent, ct: ct);

        return sent
            ? Ok(new { success = true, message = "Thanks for reaching out - we'll get back to you soon." })
            : StatusCode(500, new { success = false, message = "Could not send your message right now. Please try again shortly." });
    }
}
