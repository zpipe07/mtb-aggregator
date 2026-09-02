"use client";

import { useState } from "react";
import type { GiveawayKind } from "@/lib/giveawayStatus";
import { deriveGiveawayStatus, formatGiveawayDate } from "@/lib/giveawayStatus";
import { useAdminGiveaways } from "./hooks/queries";
import {
  useCreateGiveaway,
  useUpdateGiveaway,
  useDeleteGiveaway,
} from "./hooks/mutations";
import type { AdminGiveaway, GiveawayWriteBody } from "./api";

const inputClass =
  "w-full rounded border border-stone-300 px-3 py-2 text-stone-900";
const labelClass = "block text-sm font-medium text-stone-700 mb-1";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function rfc3339ToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToRFC3339(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type FormState = {
  slug: string;
  kind: GiveawayKind;
  title: string;
  summary: string;
  prize_name: string;
  prize_description: string;
  image_url: string;
  host_name: string;
  entry_url: string;
  official_rules_url: string;
  starts_at: string;
  ends_at: string;
  eligibility: string;
  entry_requirements: string;
  ticket_price: string;
  ticket_currency: string;
  beneficiary: string;
  published: boolean;
};

const emptyForm: FormState = {
  slug: "",
  kind: "giveaway",
  title: "",
  summary: "",
  prize_name: "",
  prize_description: "",
  image_url: "",
  host_name: "",
  entry_url: "",
  official_rules_url: "",
  starts_at: "",
  ends_at: "",
  eligibility: "",
  entry_requirements: "",
  ticket_price: "",
  ticket_currency: "USD",
  beneficiary: "",
  published: false,
};

function rowToForm(row: AdminGiveaway): FormState {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    prize_name: row.prize_name,
    prize_description: row.prize_description ?? "",
    image_url: row.image_url ?? "",
    host_name: row.host_name,
    entry_url: row.entry_url,
    official_rules_url: row.official_rules_url,
    starts_at: rfc3339ToDatetimeLocal(row.starts_at),
    ends_at: rfc3339ToDatetimeLocal(row.ends_at),
    eligibility: row.eligibility ?? "",
    entry_requirements: row.entry_requirements ?? "",
    ticket_price:
      row.ticket_price != null && row.ticket_price > 0
        ? String(row.ticket_price)
        : "",
    ticket_currency: row.ticket_currency || "USD",
    beneficiary: row.beneficiary ?? "",
    published: row.published,
  };
}

function formToWriteBody(form: FormState): GiveawayWriteBody {
  const endsAt = datetimeLocalToRFC3339(form.ends_at);
  if (!endsAt) {
    throw new Error("ends_at is required");
  }
  const kind = form.kind;
  const ticketRaw = form.ticket_price.trim();
  let ticket_price: number | null = null;
  if (kind === "raffle" && ticketRaw !== "") {
    const n = Number(ticketRaw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("ticket_price must be greater than 0");
    }
    ticket_price = n;
  }
  const body: GiveawayWriteBody = {
    kind,
    title: form.title.trim(),
    summary: form.summary.trim(),
    prize_name: form.prize_name.trim(),
    prize_description: emptyToNull(form.prize_description),
    image_url: emptyToNull(form.image_url),
    host_name: form.host_name.trim(),
    entry_url: form.entry_url.trim(),
    official_rules_url: form.official_rules_url.trim(),
    starts_at: datetimeLocalToRFC3339(form.starts_at),
    ends_at: endsAt,
    eligibility: emptyToNull(form.eligibility),
    entry_requirements: emptyToNull(form.entry_requirements),
    ticket_price,
    ticket_currency: form.ticket_currency.trim() || "USD",
    beneficiary: kind === "raffle" ? emptyToNull(form.beneficiary) : null,
    published: form.published,
  };
  const slug = form.slug.trim();
  if (slug) body.slug = slug;
  return body;
}

function rowToWriteBody(
  row: AdminGiveaway,
  overrides: Partial<GiveawayWriteBody> = {},
): GiveawayWriteBody {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    prize_name: row.prize_name,
    prize_description: row.prize_description ?? null,
    image_url: row.image_url ?? null,
    host_name: row.host_name,
    entry_url: row.entry_url,
    official_rules_url: row.official_rules_url,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at,
    eligibility: row.eligibility ?? null,
    entry_requirements: row.entry_requirements ?? null,
    ticket_price: row.kind === "raffle" ? (row.ticket_price ?? null) : null,
    ticket_currency: row.ticket_currency || "USD",
    beneficiary: row.beneficiary ?? null,
    published: row.published,
    ...overrides,
  };
}

function GiveawayForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormState;
  onSubmit: (body: GiveawayWriteBody) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewStatus = form.ends_at
    ? deriveGiveawayStatus({
        starts_at: datetimeLocalToRFC3339(form.starts_at),
        ends_at: datetimeLocalToRFC3339(form.ends_at) ?? form.ends_at,
      })
    : null;

  function patch(partial: Partial<FormState>) {
    setForm((curr) => ({ ...curr, ...partial }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(formToWriteBody(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {previewStatus ? (
        <p className="text-sm text-stone-600">
          Derived status:{" "}
          <span className="font-medium text-stone-800">{previewStatus}</span>
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="giveaway-title" className={labelClass}>
            Title
          </label>
          <input
            id="giveaway-title"
            type="text"
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-kind" className={labelClass}>
            Kind
          </label>
          <select
            id="giveaway-kind"
            value={form.kind}
            onChange={(e) => {
              const kind = e.target.value as GiveawayKind;
              patch(
                kind === "giveaway"
                  ? { kind, ticket_price: "", beneficiary: "" }
                  : { kind },
              );
            }}
            className={inputClass}
          >
            <option value="giveaway">Giveaway (free to enter)</option>
            <option value="raffle">Raffle (ticket / payment)</option>
          </select>
        </div>
        <div>
          <label htmlFor="giveaway-slug" className={labelClass}>
            Slug (optional)
          </label>
          <input
            id="giveaway-slug"
            type="text"
            value={form.slug}
            onChange={(e) => patch({ slug: e.target.value })}
            placeholder="Generated from title if blank"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="giveaway-summary" className={labelClass}>
            Summary
          </label>
          <textarea
            id="giveaway-summary"
            value={form.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            required
            rows={3}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-prize" className={labelClass}>
            Prize name
          </label>
          <input
            id="giveaway-prize"
            type="text"
            value={form.prize_name}
            onChange={(e) => patch({ prize_name: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-host" className={labelClass}>
            Host name
          </label>
          <input
            id="giveaway-host"
            type="text"
            value={form.host_name}
            onChange={(e) => patch({ host_name: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="giveaway-prize-desc" className={labelClass}>
            Prize description (optional)
          </label>
          <textarea
            id="giveaway-prize-desc"
            value={form.prize_description}
            onChange={(e) => patch({ prize_description: e.target.value })}
            rows={2}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="giveaway-image" className={labelClass}>
            Image URL (optional)
          </label>
          <input
            id="giveaway-image"
            type="url"
            value={form.image_url}
            onChange={(e) => patch({ image_url: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="giveaway-entry" className={labelClass}>
            Entry URL
          </label>
          <input
            id="giveaway-entry"
            type="url"
            value={form.entry_url}
            onChange={(e) => patch({ entry_url: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="giveaway-rules" className={labelClass}>
            Official rules URL
          </label>
          <input
            id="giveaway-rules"
            type="url"
            value={form.official_rules_url}
            onChange={(e) => patch({ official_rules_url: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-starts" className={labelClass}>
            Starts at (optional)
          </label>
          <input
            id="giveaway-starts"
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => patch({ starts_at: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-ends" className={labelClass}>
            Ends at
          </label>
          <input
            id="giveaway-ends"
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => patch({ ends_at: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-eligibility" className={labelClass}>
            Eligibility (optional)
          </label>
          <input
            id="giveaway-eligibility"
            type="text"
            value={form.eligibility}
            onChange={(e) => patch({ eligibility: e.target.value })}
            placeholder="US & Canada, 18+"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="giveaway-reqs" className={labelClass}>
            Entry requirements (optional)
          </label>
          <input
            id="giveaway-reqs"
            type="text"
            value={form.entry_requirements}
            onChange={(e) => patch({ entry_requirements: e.target.value })}
            className={inputClass}
          />
        </div>
        {form.kind === "raffle" ? (
          <>
            <div>
              <label htmlFor="giveaway-ticket" className={labelClass}>
                Ticket price (optional)
              </label>
              <input
                id="giveaway-ticket"
                type="number"
                min="0.01"
                step="0.01"
                value={form.ticket_price}
                onChange={(e) => patch({ ticket_price: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="giveaway-currency" className={labelClass}>
                Currency
              </label>
              <input
                id="giveaway-currency"
                type="text"
                maxLength={3}
                value={form.ticket_currency}
                onChange={(e) =>
                  patch({ ticket_currency: e.target.value.toUpperCase() })
                }
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="giveaway-beneficiary" className={labelClass}>
                Beneficiary (optional)
              </label>
              <input
                id="giveaway-beneficiary"
                type="text"
                value={form.beneficiary}
                onChange={(e) => patch({ beneficiary: e.target.value })}
                placeholder="Trail org, etc."
                className={inputClass}
              />
            </div>
          </>
        ) : null}
        <div className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => patch({ published: e.target.checked })}
            />
            Published (visible on /giveaways)
          </label>
        </div>
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

export function GiveawayManager() {
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<AdminGiveaway | null>(null);

  const { data: rows = [], isPending: loading, isError, error } = useAdminGiveaways();
  const createMutation = useCreateGiveaway();
  const updateMutation = useUpdateGiveaway();
  const deleteMutation = useDeleteGiveaway();

  const displayError =
    deleteMutation.error?.message ??
    updateMutation.error?.message ??
    (isError ? error?.message ?? "Failed to load" : null);

  async function handleCreate(body: GiveawayWriteBody) {
    await createMutation.mutateAsync(body);
    setModal(null);
  }

  async function handleUpdate(body: GiveawayWriteBody) {
    if (!editing) return;
    await updateMutation.mutateAsync({ id: editing.id, body });
    setModal(null);
    setEditing(null);
  }

  function handleDelete(row: AdminGiveaway) {
    if (
      !window.confirm(
        `Delete “${row.title}”? This cannot be undone. Unpublish instead if you may bring it back.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(row.id);
  }

  function handleTogglePublished(row: AdminGiveaway) {
    updateMutation.mutate({
      id: row.id,
      body: rowToWriteBody(row, { published: !row.published }),
    });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-800 mb-1">Giveaways</h2>
      <p className="text-sm text-stone-600 mb-4 max-w-2xl">
        Curate MTB giveaways and raffles. Public list shows published rows whose
        end date is within the last 30 days. Status is derived from timestamps.
      </p>

      {displayError ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {displayError}
          <button
            type="button"
            onClick={() => {
              deleteMutation.reset();
              updateMutation.reset();
            }}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-stone-600">Loading…</p>
      ) : (
        <>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setModal("add");
              }}
              className="rounded bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Add giveaway
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="px-4 py-2 text-left font-medium text-stone-600">
                      Title
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">
                      Kind
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">
                      Ends
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-stone-600">
                      Published
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-stone-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = deriveGiveawayStatus(row);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-stone-100 hover:bg-stone-50"
                      >
                        <td className="px-4 py-2 font-medium text-stone-800">
                          {row.title}
                          <div className="text-xs font-normal text-stone-500">
                            {row.host_name}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-stone-600">{row.kind}</td>
                        <td className="px-4 py-2 text-stone-600">{status}</td>
                        <td className="px-4 py-2 text-stone-600">
                          {formatGiveawayDate(row.ends_at) || row.ends_at}
                        </td>
                        <td className="px-4 py-2 text-stone-600">
                          {row.published ? "yes" : "draft"}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleTogglePublished(row)}
                            disabled={updateMutation.isPending}
                            className="mr-1 rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100 disabled:opacity-50"
                          >
                            {row.published ? "Unpublish" : "Publish"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(row);
                              setModal("edit");
                            }}
                            className="mr-1 rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-stone-500">
                No giveaways yet. Add a published contest to show it on
                /giveaways.
              </p>
            ) : null}
          </div>
        </>
      )}

      {modal !== null ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-stone-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-stone-800">
              {modal === "add" ? "Add giveaway" : "Edit giveaway"}
            </h3>
            <GiveawayForm
              key={editing?.id ?? "new"}
              initial={editing ? rowToForm(editing) : emptyForm}
              onSubmit={modal === "add" ? handleCreate : handleUpdate}
              onCancel={() => {
                setModal(null);
                setEditing(null);
              }}
              submitLabel={modal === "add" ? "Create" : "Save"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
