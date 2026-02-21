import type { Status } from "../api";

type StatusBarProps = {
  status: Status;
};

export function StatusBar({ status }: StatusBarProps) {
  return (
    <div className="bg-stone-200 border-b border-stone-300 px-6 py-3">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${status.scraper_reachable ? "bg-green-600" : "bg-red-500"}`}
            title={
              status.scraper_reachable
                ? "Scraper reachable"
                : "Scraper offline"
            }
          />
          <span className="text-stone-700">
            Scraper {status.scraper_reachable ? "online" : "offline"}
          </span>
        </div>
        {status.stores.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2 text-stone-600"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${s.success ? "bg-green-600" : "bg-amber-500"}`}
              title={s.success ? "Has scraped data" : "No data yet"}
            />
            <span>{s.name}:</span>
            <span>
              {s.last_scraped
                ? new Date(s.last_scraped).toLocaleString()
                : "—"}
            </span>
            <span className="text-stone-500">({s.deal_count} deals)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
