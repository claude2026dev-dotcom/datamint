namespace Datamint.Application.DTOs;

public record FieldTemplateDto(Guid Id, string Name, List<string> Fields, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);

public record SaveFieldTemplateRequestDto(string Name, List<string> Fields);
