import { useEffect, useState, useCallback } from "react";
import {
  fetchAdminStores,
  fetchStoreTypes,
  createStore,
  updateStore,
  deleteStore,
  triggerScrape,
  type AdminStore,
  type StoreFormBody,
} from "./api";

const emptyForm: StoreFormBody = {
  name: "",
  base_url: "",
  scrape_url: "",
  store_type: "jensonusa",
  affiliate_network: null,
};

function StoreForm({
  initial,
  storeTypes,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: StoreFormBody;
  storeTypes: string[];
  onSubmit: (body: StoreFormBody) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial.name);
  const [baseUrl, setBaseUrl] = useState(initial.base_url);
  const [scrapeUrl, setScrapeUrl] = useState(initial.scrape_url);
  const [storeType, setStoreType] = useState(initial.store_type);
  const [affiliateNetwork, setAffiliateNetwork] = useState(initial.affiliate_network ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        base_url: baseUrl.trim(),
        scrape_url: scrapeUrl.trim(),
        store_type: storeType || "jensonusa",
        affiliate_network: affiliateNetwork.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div>
        <label htmlFor="store-name" className="block text-sm font-medium text-stone-700 mb-1">
          Name
        </label>
        <input
          id="store-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="store-base-url" className="block text-sm font-medium text-stone-700 mb-1">
          Base URL
        </label>
        <input
          id="store-base-url"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="store-scrape-url" className="block text-sm font-medium text-stone-700 mb-1">
          Scrape URL
        </label>
        <input
          id="store-scrape-url"
          type="url"
          value={scrapeUrl}
          onChange={(e) => setScrapeUrl(e.target.value)}
          required
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div>
        <label htmlFor="store-type" className="block text-sm font-medium text-stone-700 mb-1">
          Store type
        </label>
        <select
          id="store-type"
          value={storeType}
          onChange={(e) => setStoreType(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        >
          {storeTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="store-affiliate" className="block text-sm font-medium text-stone-700 mb-1">
          Affiliate network (optional)
        </label>
        <input
          id="store-affiliate"
          type="text"
          value={affiliateNetwork}
          onChange={(e) => setAffiliateNetwork(e.target.value)}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function StoreManager() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [storeTypes, setStoreTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editingStore, setEditingStore] = useState<AdminStore | null>(null);
  const [scrapingId, setScrapingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchAdminStores(), fetchStoreTypes()])
      .then(([s, t]) => {
        setStores(s);
        setStoreTypes(t.length > 0 ? t : ["jensonusa", "worldwidecyclery", "revelbikes"]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(body: StoreFormBody) {
    await createStore(body);
    setModal(null);
    load();
  }

  async function handleUpdate(body: StoreFormBody) {
    if (!editingStore) return;
    await updateStore(editingStore.id, body);
    setModal(null);
    setEditingStore(null);
    load();
  }

  async function handleDelete(store: AdminStore) {
    if (!window.confirm(`Delete "${store.name}"? This will remove all listings and price history for this store.`))
      return;
    try {
      await deleteStore(store.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleScrape(store: AdminStore) {
    setScrapingId(store.id);
    try {
      await triggerScrape(store.store_type);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScrapingId(null);
    }
  }

  const formInitial: StoreFormBody =
    editingStore != null
      ? {
          name: editingStore.name,
          base_url: editingStore.base_url,
          scrape_url: editingStore.scrape_url,
          store_type: editingStore.store_type,
          affiliate_network: editingStore.affiliate_network ?? null,
        }
      : emptyForm;

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-4">Stores</h2>

      {error && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-stone-600">Loading…</p>
      ) : (
        <>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                setEditingStore(null);
                setModal("add");
              }}
              className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Add store
            </button>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Name</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Type</th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">Scrape URL</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Listings</th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => (
                    <tr key={store.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="px-4 py-2 font-medium text-stone-800">{store.name}</td>
                      <td className="px-4 py-2 text-stone-600">{store.store_type}</td>
                      <td className="px-4 py-2 text-stone-600 max-w-xs truncate" title={store.scrape_url}>
                        {store.scrape_url}
                      </td>
                      <td className="px-4 py-2 text-right">{store.deal_count}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleScrape(store)}
                          disabled={scrapingId !== null}
                          className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 disabled:opacity-50 mr-1"
                        >
                          {scrapingId === store.id ? "…" : "Scrape"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStore(store);
                            setModal("edit");
                          }}
                          className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 mr-1"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(store)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stores.length === 0 && (
              <p className="px-4 py-6 text-center text-stone-500">No stores. Add one to get started.</p>
            )}
          </div>
        </>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-stone-800 mb-4">
              {modal === "add" ? "Add store" : "Edit store"}
            </h3>
            <StoreForm
              initial={formInitial}
              storeTypes={storeTypes}
              onSubmit={modal === "add" ? handleCreate : handleUpdate}
              onCancel={() => {
                setModal(null);
                setEditingStore(null);
              }}
              submitLabel={modal === "add" ? "Create" : "Save"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
