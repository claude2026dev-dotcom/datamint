using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Datamint.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class BackfillOriginalSemanticType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Rows extracted before OriginalSemanticType existed have it stored as NULL, which
            // made "OriginalSemanticType != SemanticType" permanently true - a legacy field's
            // "edited" flag could never clear again even after being set back to its own current
            // type. Backfill NULLs to the field's own current type (the closest available
            // baseline), then recompute WasEditedByUser for every row so any flag already stuck
            // true by this bug self-heals immediately instead of waiting for a future edit.
            migrationBuilder.Sql(@"
                UPDATE [ExtractedFields] SET [OriginalSemanticType] = [SemanticType] WHERE [OriginalSemanticType] IS NULL;

                UPDATE [ExtractedFields]
                SET [WasEditedByUser] = CASE WHEN
                    ISNULL([OriginalAiValue], N'') <> ISNULL([FieldValue], N'')
                    OR ISNULL([OriginalFieldKey], N'') <> ISNULL([FieldKey], N'')
                    OR ISNULL([OriginalSemanticType], N'') <> ISNULL([SemanticType], N'')
                  THEN 1 ELSE 0 END;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data backfill only - not reversible (the original NULLs carried no information to
            // restore).
        }
    }
}
