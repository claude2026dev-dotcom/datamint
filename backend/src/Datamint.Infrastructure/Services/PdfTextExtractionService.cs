using Datamint.Application.DTOs;
using Datamint.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Tesseract;
using UglyToad.PdfPig;
using UglyToad.PdfPig.AcroForms;
using UglyToad.PdfPig.AcroForms.Fields;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Reads a PDF's text layer with PdfPig; any page with no usable text is
/// treated as scanned/image-only and is OCR'd with Tesseract instead. This is
/// AI-provider-agnostic — it only produces plain page text, which is then handed
/// to whichever IAiFieldExtractionService is configured (Claude, OpenAI, ...).
/// </summary>
public class PdfTextExtractionService : IPdfTextExtractionService
{
    private readonly IConfiguration _config;
    private readonly ILogger<PdfTextExtractionService> _logger;

    public PdfTextExtractionService(IConfiguration config, ILogger<PdfTextExtractionService> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<PdfTextExtractionResultDto> ExtractTextAsync(string filePath, CancellationToken ct = default)
    {
        var pages = new List<PdfPageTextDto>();
        bool anyOcrUsed = false;

        using var document = PdfDocument.Open(filePath);
        int pageNumber = 0;

        // Many real-world "fillable" PDFs (purchase orders, government forms, sign-and-return
        // agreements) don't put the answers a person typed/annotated into the page's normal
        // text content stream at all - not even as AcroForm fields, in the common case where a
        // "Fill & Sign"-style tool just draws FreeText annotations on top of a flat template.
        // page.Text alone then only ever sees the blank template ("Date: ___________"), and the
        // AI has no way to know the real value was ever there. Reading both the document's
        // AcroForm (if any) and every page's annotations, and folding their content back into
        // the text handed to the AI, is what actually recovers that data. This runs on every
        // upload now (not just forms), so any single malformed/unusual PDF's form or annotation
        // structure must never take down extraction that would otherwise have worked fine -
        // each enrichment step is wrapped and just quietly contributes nothing on failure.
        string? formFieldsText = null;
        try
        {
            if (document.TryGetForm(out var form)) formFieldsText = BuildFormFieldsText(form);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read AcroForm fields for {File}; continuing without them.", filePath);
        }

        foreach (var page in document.GetPages())
        {
            pageNumber++;
            var text = page.Text;
            var usedOcr = false;

            if (string.IsNullOrWhiteSpace(text))
            {
                // No text layer -> this page is a scan/image. Fall back to OCR.
                text = RunOcrOnPage(filePath, pageNumber);
                anyOcrUsed = true;
                usedOcr = true;
            }

            string? annotationsText = null;
            try
            {
                annotationsText = BuildAnnotationValuesText(page);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not read annotations on page {Page} of {File}; continuing without them.", pageNumber, filePath);
            }
            if (!string.IsNullOrEmpty(annotationsText)) text = $"{text}\n\n{annotationsText}";
            // Form field values are document-wide, not per-page, but only worth attaching
            // once - the first page they're extracted alongside is as good as any.
            if (pageNumber == 1 && !string.IsNullOrEmpty(formFieldsText)) text = $"{text}\n\n{formFieldsText}";

            pages.Add(new PdfPageTextDto(pageNumber, text, usedOcr));
        }

        return Task.FromResult(new PdfTextExtractionResultDto(pageNumber, anyOcrUsed, pages));
    }

    /// <summary>Filled-in AcroForm field values, if this PDF actually uses real interactive
    /// form fields (as opposed to FreeText annotations - see BuildAnnotationValuesText). Field
    /// names here are the form's own, so no proximity guessing is needed to label them.</summary>
    private static string? BuildFormFieldsText(AcroForm form)
    {
        var lines = new List<string>();
        foreach (var field in form.Fields)
        {
            var name = field.Information.PartialName;
            if (string.IsNullOrWhiteSpace(name)) continue;

            var value = field switch
            {
                AcroTextField tf => tf.Value,
                AcroCheckboxField cb => cb.IsChecked ? "Checked" : "Unchecked",
                _ => null
            };
            if (string.IsNullOrWhiteSpace(value)) continue;

            lines.Add($"- \"{name}\" = \"{value}\"");
        }

        if (lines.Count == 0) return null;
        return "[Values entered into this PDF's fillable form fields - these are the real answers, use them]:\n" + string.Join("\n", lines);
    }

    /// <summary>
    /// FreeText/markup annotation content isn't part of page.Text at all, so a value a person
    /// typed via a "fill and sign" style tool is otherwise invisible to extraction. Each
    /// annotation is paired with whichever printed word sits immediately to its left (same
    /// line) or immediately above it (if there's nothing to its left) - a purely
    /// position-based heuristic that works for any document's layout, not just one kind of form.
    /// </summary>
    private static string? BuildAnnotationValuesText(UglyToad.PdfPig.Content.Page page)
    {
        var annotations = page.GetAnnotations()
            .Where(a => !string.IsNullOrWhiteSpace(a.Content))
            .ToList();
        if (annotations.Count == 0) return null;

        var words = page.GetWords().ToList();
        var lines = new List<string>();

        foreach (var annotation in annotations)
        {
            var label = FindNearestLabel(annotation.Rectangle, words);
            lines.Add(label is null
                ? $"- \"{annotation.Content.Trim()}\""
                : $"- near \"{label}\" → \"{annotation.Content.Trim()}\"");
        }

        return "[Filled-in values found on this page as separate annotations/overlays, not part of the printed " +
               "template text below - these are the real answers for the corresponding blank/underscored fields " +
               "above, matched here by their position on the page]:\n" + string.Join("\n", lines);
    }

    private static string? FindNearestLabel(PdfRectangle target, List<Word> words)
    {
        const double sameLineTolerance = 4.0; // points of vertical wiggle room to count as "the same line"
        const double maxSearchDistance = 150.0;
        const double wordGapForSamePhrase = 25.0; // max gap between words still counted as one label phrase

        var verticalCenter = (target.Top + target.Bottom) / 2;

        // Prefer the words immediately to the left, on the same line - the common
        // "Label: ____answer____" layout. Walk left from the nearest word, gathering the whole
        // run of closely-spaced words into one phrase (e.g. "TAX EXEMPT", not just "EXEMPT") so
        // the AI gets the full label, not a fragment that could be confused with a neighboring
        // row's label in a tightly-packed table.
        var sameLineWords = words
            .Where(w => Math.Abs(((w.BoundingBox.Top + w.BoundingBox.Bottom) / 2) - verticalCenter) <= sameLineTolerance
                        && w.BoundingBox.Right <= target.Left + 1)
            .OrderByDescending(w => w.BoundingBox.Right)
            .ToList();
        if (sameLineWords.Count > 0 && target.Left - sameLineWords[0].BoundingBox.Right <= maxSearchDistance)
        {
            var phrase = new List<string> { sameLineWords[0].Text };
            for (var i = 1; i < sameLineWords.Count; i++)
            {
                if (sameLineWords[i - 1].BoundingBox.Left - sameLineWords[i].BoundingBox.Right > wordGapForSamePhrase) break;
                phrase.Add(sameLineWords[i].Text);
            }
            phrase.Reverse();
            return string.Join(" ", phrase);
        }

        // Otherwise fall back to the closest full line of words directly above, within a
        // similar horizontal band - the "Label\n____answer____" layout.
        var closestAbove = words
            .Where(w => w.BoundingBox.Bottom >= target.Top - 1
                        && Math.Abs(w.BoundingBox.Left - target.Left) <= maxSearchDistance)
            .OrderBy(w => w.BoundingBox.Bottom - target.Top)
            .FirstOrDefault();
        if (closestAbove is null) return null;

        var aboveLineCenter = (closestAbove.BoundingBox.Top + closestAbove.BoundingBox.Bottom) / 2;
        var aboveLine = words
            .Where(w => Math.Abs(((w.BoundingBox.Top + w.BoundingBox.Bottom) / 2) - aboveLineCenter) <= sameLineTolerance)
            .OrderBy(w => w.BoundingBox.Left)
            .Select(w => w.Text);
        return string.Join(" ", aboveLine);
    }

    /// <summary>
    /// Renders the given page to an image and runs Tesseract OCR on it.
    /// Requires the "tessdata" folder (eng.traineddata) to be deployed
    /// alongside the app — see README for setup.
    /// </summary>
    private string RunOcrOnPage(string filePath, int pageNumber)
    {
        try
        {
            var tessDataPath = _config["Ocr:TessDataPath"] ?? "./tessdata";
            // NOTE: rendering the PDF page to a bitmap is handled via PdfiumViewer
            // in the real implementation (kept out of this scaffold to avoid a
            // native-library dependency at build time). Wire this up as:
            //   1. Render page -> PNG bytes (PdfiumViewer / Pdfium)
            //   2. Feed PNG bytes into Tesseract below
            using var engine = new TesseractEngine(tessDataPath, "eng", EngineMode.Default);
            // Placeholder: replace `imageBytes` with the actual rendered page image.
            byte[] imageBytes = Array.Empty<byte>();
            if (imageBytes.Length == 0)
            {
                _logger.LogWarning("OCR rendering step not wired up yet for page {Page} of {File}. See README > OCR setup.", pageNumber, filePath);
                return string.Empty;
            }
            using var img = Pix.LoadFromMemory(imageBytes);
            using var result = engine.Process(img);
            return result.GetText();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OCR failed for page {Page} of {File}", pageNumber, filePath);
            return string.Empty;
        }
    }
}
