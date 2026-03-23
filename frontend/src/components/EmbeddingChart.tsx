'use client';

interface EmbeddingChartProps {
  embedding: number[];
}

export default function EmbeddingChart({ embedding }: EmbeddingChartProps) {
  if (!embedding || embedding.length === 0) {
    return <p className="text-sm text-gray-500">No embedding data</p>;
  }

  const maxAbs = Math.max(...embedding.map(Math.abs), 1);
  const displayCount = Math.min(embedding.length, 128);
  const slice = embedding.slice(0, displayCount);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Embedding ({embedding.length} dims, showing {displayCount})
      </h4>
      <div className="flex items-end gap-px rounded-lg bg-gray-800/50 p-3" style={{ height: 120 }}>
        {slice.map((val, i) => {
          const normalized = val / maxAbs;
          const height = Math.abs(normalized) * 50;
          const isPositive = normalized >= 0;
          return (
            <div
              key={i}
              className="relative flex flex-1 justify-center"
              style={{ height: '100%' }}
            >
              <div
                className={`absolute w-full max-w-[4px] rounded-sm transition-all ${
                  isPositive ? 'bg-chain-500' : 'bg-amber-500'
                }`}
                style={{
                  height: `${height}%`,
                  bottom: isPositive ? '50%' : undefined,
                  top: isPositive ? undefined : '50%',
                  opacity: 0.4 + Math.abs(normalized) * 0.6,
                }}
                title={`dim[${i}]: ${val}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>dim 0</span>
        <span>dim {displayCount - 1}</span>
      </div>
    </div>
  );
}
