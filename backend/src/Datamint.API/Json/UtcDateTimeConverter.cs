using System.Text.Json;
using System.Text.Json.Serialization;

namespace Datamint.API.Json;

/// <summary>
/// EF Core + SQL Server round-trip DateTime as Kind=Unspecified, so the default
/// System.Text.Json writer omits the 'Z' suffix — browsers then parse these
/// UTC instants as if they were already local time. Every DateTime in this app
/// is a UTC instant by convention (all named "*AtUtc"), so force Kind=Utc on
/// write to guarantee a 'Z'-suffixed, spec-compliant UTC string.
/// </summary>
public class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        DateTime.SpecifyKind(reader.GetDateTime(), DateTimeKind.Utc);

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}

public class UtcNullableDateTimeConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Null ? null : DateTime.SpecifyKind(reader.GetDateTime(), DateTimeKind.Utc);

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value is null) writer.WriteNullValue();
        else writer.WriteStringValue(DateTime.SpecifyKind(value.Value, DateTimeKind.Utc));
    }
}
