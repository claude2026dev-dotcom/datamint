using System.Threading.Channels;
using Datamint.Application.Interfaces;

namespace Datamint.Infrastructure.Services;

/// <summary>Unbounded in-process channel - fine for this app's single-instance deployment
/// (no cross-instance durability needed); DocumentProcessingBackgroundService sweeps for
/// anything left mid-flight by a previous process on startup, since this queue's contents
/// don't survive a restart.</summary>
public class InMemoryBackgroundJobQueue : IBackgroundJobQueue
{
    private readonly Channel<DocumentProcessingWorkItem> _channel = Channel.CreateUnbounded<DocumentProcessingWorkItem>();

    public void QueueDocumentProcessing(DocumentProcessingWorkItem item) =>
        _channel.Writer.TryWrite(item);

    public IAsyncEnumerable<DocumentProcessingWorkItem> DequeueAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}
