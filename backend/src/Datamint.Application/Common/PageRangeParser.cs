namespace Datamint.Application.Common;

/// <summary>
/// Parses a user-typed page-range spec ("1-3,5") into a distinct, sorted, 1-based page number
/// list, silently dropping tokens that are malformed or out of bounds rather than rejecting the
/// whole spec - a typo in one range shouldn't block pages the user clearly did specify correctly.
/// </summary>
public static class PageRangeParser
{
    public static List<int> Parse(string? spec, int totalPages)
    {
        if (string.IsNullOrWhiteSpace(spec)) return Enumerable.Range(1, totalPages).ToList();

        var pages = new SortedSet<int>();
        foreach (var rawToken in spec.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            var dashIndex = rawToken.IndexOf('-');
            if (dashIndex > 0)
            {
                var startText = rawToken[..dashIndex].Trim();
                var endText = rawToken[(dashIndex + 1)..].Trim();
                if (!int.TryParse(startText, out var start) || !int.TryParse(endText, out var end)) continue;
                if (start > end) (start, end) = (end, start);
                for (var p = Math.Max(1, start); p <= Math.Min(totalPages, end); p++) pages.Add(p);
            }
            else if (int.TryParse(rawToken, out var single) && single >= 1 && single <= totalPages)
            {
                pages.Add(single);
            }
        }

        return pages.Count > 0 ? pages.ToList() : Enumerable.Range(1, totalPages).ToList();
    }
}
