namespace Datamint.Application.Interfaces;

public record ProcessedAvatarImage(byte[] Bytes, string Extension, string ContentType);

/// <summary>
/// Validates and re-encodes a user-uploaded profile picture. Never trust or store the
/// raw uploaded bytes directly - a file can claim to be a JPEG by extension/content-type
/// while actually being something else entirely (a script, a polyglot file, a decompression
/// bomb). Decoding it with a real image library and re-encoding the result is what actually
/// proves it's a well-formed image, not just a plausible-looking one.
/// </summary>
public interface IAvatarImageService
{
    /// <summary>Throws with a user-facing message if the bytes aren't a valid, safely-sized image.</summary>
    Task<ProcessedAvatarImage> ProcessAsync(Stream input, CancellationToken ct = default);
}
