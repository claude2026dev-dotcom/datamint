using Datamint.Application.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Datamint.Infrastructure.Services;

/// <summary>
/// Renders a one-page PDF receipt via QuestPDF - see Program.cs for the required
/// QuestPDF.Settings.License declaration (Community license: free under $1M USD annual
/// gross revenue; a Professional/Enterprise license is needed above that - see
/// https://www.questpdf.com/license/ before this app is generating real revenue).
/// </summary>
public class InvoicePdfService : IInvoicePdfService
{
    public byte[] Generate(InvoicePdfDetails d)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(11));

                page.Header().Row(row =>
                {
                    row.RelativeItem().Column(col =>
                    {
                        col.Item().Text(d.AppName).FontSize(18).Bold();
                        col.Item().Text("Payment receipt").FontSize(10).FontColor(Colors.Grey.Medium);
                    });
                    row.ConstantItem(120).AlignRight().Column(col =>
                    {
                        col.Item().Text(d.InvoiceNumber).FontSize(11).Bold().AlignRight();
                        col.Item().Text(d.IssuedAtUtc.ToString("MMM d, yyyy")).FontSize(10).FontColor(Colors.Grey.Medium).AlignRight();
                    });
                });

                page.Content().PaddingTop(20).Column(col =>
                {
                    col.Item().PaddingBottom(16).Column(billTo =>
                    {
                        billTo.Item().Text("Billed to").FontSize(9).FontColor(Colors.Grey.Medium);
                        billTo.Item().Text(d.CustomerName).Bold();
                        billTo.Item().Text(d.CustomerEmail).FontColor(Colors.Grey.Medium);
                    });

                    col.Item().PaddingTop(8).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.ConstantColumn(90);
                        });

                        table.Header(header =>
                        {
                            header.Cell().BorderBottom(1).BorderColor(Colors.Black).PaddingBottom(4).Text("Description").Bold();
                            header.Cell().BorderBottom(1).BorderColor(Colors.Black).PaddingBottom(4).AlignRight().Text("Amount").Bold();
                        });

                        table.Cell().PaddingTop(8).Text($"{d.PlanName} plan");
                        table.Cell().PaddingTop(8).AlignRight().Text($"{d.Currency} {d.Amount:0.00}");

                        table.Cell().ColumnSpan(2).PaddingTop(10).BorderTop(2).BorderColor(Colors.Black);

                        table.Cell().PaddingTop(6).Text("Total paid").Bold();
                        table.Cell().PaddingTop(6).AlignRight().Text($"{d.Currency} {d.Amount:0.00}").Bold();
                    });
                });

                page.Footer().PaddingTop(20).Text($"{d.AppName} — this receipt was generated automatically for your records.")
                    .FontSize(8).FontColor(Colors.Grey.Medium);
            });
        });

        return document.GeneratePdf();
    }
}
