export default function CampaignStudioLoading() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-4 w-36 rounded-lg bg-zinc-800/80" />
      </div>

      {/* Campaign header skeleton */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-56 rounded-lg bg-zinc-800" />
              <div className="h-3 w-32 rounded-lg bg-zinc-800/60" />
            </div>
          </div>
          {/* Status badge + action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-6 w-20 rounded-full bg-zinc-800" />
            <div className="h-7 w-7 rounded-lg bg-zinc-800" />
            <div className="h-7 w-7 rounded-lg bg-zinc-800" />
            <div className="h-7 w-24 rounded-lg bg-zinc-800" />
          </div>
        </div>

        {/* KPI chips row */}
        <div className="flex items-center gap-3 pt-3 border-t border-zinc-800/60">
          <div className="h-6 w-24 rounded-lg bg-zinc-800/60" />
          <div className="h-6 w-24 rounded-lg bg-zinc-800/60" />
          <div className="h-6 w-24 rounded-lg bg-zinc-800/60" />
          <div className="h-6 w-24 rounded-lg bg-zinc-800/60" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/60 border border-zinc-800 w-fit">
        <div className="h-7 w-28 rounded-lg bg-zinc-800" />
        <div className="h-7 w-28 rounded-lg bg-zinc-800/50" />
        <div className="h-7 w-28 rounded-lg bg-zinc-800/50" />
        <div className="h-7 w-28 rounded-lg bg-zinc-800/50" />
      </div>

      {/* Main content area — sequence steps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Steps list */}
        <div className="lg:col-span-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-zinc-800 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 rounded-lg bg-zinc-800" />
                  <div className="h-3 w-16 rounded-lg bg-zinc-800/60" />
                </div>
              </div>
              <div className="h-3 w-full rounded-lg bg-zinc-800/50" />
              <div className="h-3 w-3/4 rounded-lg bg-zinc-800/50" />
            </div>
          ))}
          <div className="h-9 w-full rounded-xl bg-zinc-800/40 border border-dashed border-zinc-700" />
        </div>

        {/* Preview / editor panel */}
        <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-zinc-800/60">
            <div className="h-4 w-40 rounded-lg bg-zinc-800" />
            <div className="ml-auto h-6 w-20 rounded-lg bg-zinc-800" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded-lg bg-zinc-800/60" />
            <div className="h-3 w-5/6 rounded-lg bg-zinc-800/60" />
            <div className="h-3 w-4/6 rounded-lg bg-zinc-800/60" />
          </div>
          <div className="h-32 rounded-xl bg-zinc-800/40" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded-lg bg-zinc-800/50" />
            <div className="h-3 w-3/4 rounded-lg bg-zinc-800/50" />
            <div className="h-3 w-5/6 rounded-lg bg-zinc-800/50" />
            <div className="h-3 w-2/3 rounded-lg bg-zinc-800/50" />
          </div>
        </div>
      </div>
    </div>
  )
}

