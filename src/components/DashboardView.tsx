import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Search,
  Share2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { AuthUser, ShardId, ShortLinkRecord } from '../types';
import { normalizeAndValidateUrl } from '../lib/distributed';

export interface EditLinkPayload {
  url: string;
  expiryDate: string | null;
  linkPassword?: string;
  clearPassword?: boolean;
}

interface DashboardViewProps {
  user: AuthUser;
  links: ShortLinkRecord[];
  isLoading: boolean;
  onEdit: (shortCode: string, payload: EditLinkPayload) => Promise<string | null>;
  onDelete: (shortCode: string) => Promise<void>;
  onSimulateLookup: (shortCode: string, password?: string) => Promise<void>;
  onGoToShortener: () => void;
}

type ShardFilter = 'ALL' | ShardId;

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function DashboardView({
  user,
  links,
  isLoading,
  onEdit,
  onDelete,
  onSimulateLookup,
  onGoToShortener,
}: DashboardViewProps) {
  const isAdmin = user.role === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [shardFilter, setShardFilter] = useState<ShardFilter>('ALL');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  // Admin Edit modal state
  const [editingLink, setEditingLink] = useState<ShortLinkRecord | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editExpiry, setEditExpiry] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const filteredLinks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return links.filter((link) => {
      if (shardFilter !== 'ALL' && link.shardId !== shardFilter) {
        return false;
      }
      if (!q) return true;
      return (
        link.shortCode.toLowerCase().includes(q) ||
        link.longUrl.toLowerCase().includes(q) ||
        link.userEmail.toLowerCase().includes(q)
      );
    });
  }, [links, searchQuery, shardFilter]);

  function openEditModal(link: ShortLinkRecord) {
    setEditingLink(link);
    setEditUrl(link.longUrl);
    setEditExpiry(toDateTimeLocalValue(link.expiryDate));
    setEditPassword('');
    setClearPassword(false);
    setEditError(null);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editingLink) return;

    const urlCheck = normalizeAndValidateUrl(editUrl);
    if (!urlCheck.ok) {
      setEditError(urlCheck.error);
      return;
    }

    setEditError(null);
    setIsSavingEdit(true);
    try {
      const serverErr = await onEdit(editingLink.shortCode, {
        url: urlCheck.url,
        expiryDate: editExpiry ? new Date(editExpiry).toISOString() : null,
        linkPassword: editPassword.trim() || undefined,
        clearPassword,
      });
      if (serverErr) {
        setEditError(serverErr);
        return;
      }
      setEditingLink(null);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleCopy(shortCode: string) {
    const fullUrl = `${window.location.origin}/${shortCode}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      // Fallback ignored if clipboard blocked
    }
    setCopiedCode(shortCode);
    setTimeout(() => setCopiedCode(null), 1600);
  }

  async function handleDelete(shortCode: string) {
    setBusyCode(shortCode);
    try {
      await onDelete(shortCode);
    } finally {
      setBusyCode(null);
    }
  }

  async function handleSimulate(shortCode: string) {
    setBusyCode(shortCode);
    try {
      await onSimulateLookup(shortCode);
    } finally {
      setBusyCode(null);
    }
  }

  return (
    <section aria-labelledby="dashboard-heading" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="dashboard-heading"
            className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white"
          >
            Links Directory
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {isAdmin
              ? 'Admin mode · Inspect, edit destinations/expiry, and remove links across DB 1 and DB 2.'
              : 'Standard User mode · View and test shortened links. Editing and removal require Admin permissions.'}
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          Showing {filteredLinks.length} of {links.length} records
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <label htmlFor="dashboard-search" className="sr-only">
            Search short links, destination URLs, or owner emails
          </label>
          <input
            id="dashboard-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by code, URL, or owner email..."
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500"
          />
        </div>

        {/* Segmented Shard Filter */}
        <div
          role="group"
          aria-label="Filter by database shard"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 self-start dark:border-slate-800 dark:bg-slate-900"
        >
          {(
            [
              { id: 'ALL', label: 'All Shards' },
              { id: 'DB_1', label: 'DB 1 (A–M)' },
              { id: 'DB_2', label: 'DB 2 (N–Z)' },
            ] as const
          ).map((tab) => {
            const active = shardFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShardFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* High-Density Links Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="divide-y divide-slate-100 p-4 dark:divide-slate-800">
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex h-12 items-center justify-between gap-4 py-3"
              >
                <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {links.length === 0
                ? 'No shortened links yet'
                : 'No links match your search or shard filter'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {links.length === 0
                ? 'Create your first short link to populate the directory.'
                : 'Try clearing the search query or switching back to All Shards.'}
            </p>
            <button
              type="button"
              onClick={
                links.length === 0
                  ? onGoToShortener
                  : () => {
                      setSearchQuery('');
                      setShardFilter('ALL');
                    }
              }
              className="mt-4 inline-flex items-center rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {links.length === 0 ? 'Shorten First URL' : 'Reset Filters'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
                  <th className="px-3.5 py-3">Short Link</th>
                  <th className="px-3.5 py-3">Destination & Owner</th>
                  <th className="px-3.5 py-3">Shard & Cache</th>
                  <th className="px-3.5 py-3 text-right">Clicks</th>
                  <th className="px-3.5 py-3">Created</th>
                  <th className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLinks.map((link) => {
                  const isBusy = busyCode === link.shortCode;
                  const formattedDate = new Date(
                    link.createdAt,
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr
                      key={link.shortCode}
                      data-testid={`link-row-${link.shortCode}`}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3.5 py-3 font-mono text-xs sm:text-sm whitespace-nowrap">
                        <a
                          href={`/${link.shortCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <span>{link.shortUrl}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        </a>
                      </td>

                      <td className="max-w-[230px] px-3.5 py-3 text-xs sm:text-sm">
                        <div
                          className="truncate font-medium text-slate-800 dark:text-slate-200"
                          title={link.longUrl}
                        >
                          {link.longUrl}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="truncate">{link.userEmail}</span>
                          {link.hasPassword && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-amber-700 dark:text-amber-400">
                                Protected
                              </span>
                            </>
                          )}
                          {link.expiryDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  link.isExpired
                                    ? 'font-medium text-red-600 dark:text-red-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }
                              >
                                {link.isExpired
                                  ? 'Expired'
                                  : `Exp ${new Date(link.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-3.5 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {link.shardLabel}
                        </span>
                        <span aria-hidden="true" className="mx-1.5 text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <span
                          className={
                            link.cachedInRedis
                              ? 'font-medium text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }
                        >
                          {link.cachedInRedis ? 'Redis Warm' : 'Cold'}
                        </span>
                      </td>

                      <td
                        data-testid={`clicks-count-${link.shortCode}`}
                        className="px-3.5 py-3 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
                      >
                        {link.clicks}
                      </td>

                      <td className="px-3.5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {formattedDate}
                      </td>

                      <td className="px-3.5 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSimulate(link.shortCode)}
                            disabled={isBusy || link.isExpired || link.hasPassword}
                            aria-label={`Simulate visit for ${link.shortCode}`}
                            title={
                              link.isExpired
                                ? 'Link has expired'
                                : link.hasPassword
                                  ? 'Open link directly to enter password'
                                  : 'Simulate 301 lookup & increment clicks'
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400 dark:hover:border-blue-700 dark:hover:bg-blue-950/60 whitespace-nowrap"
                          >
                            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Hit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopy(link.shortCode)}
                            aria-label={`Copy short link for ${link.shortCode}`}
                            title="Copy shareable redirect link"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            {copiedCode === link.shortCode ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>

                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(
                              `${typeof window !== 'undefined' ? window.location.origin : ''}/${link.shortCode}`,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Share ${link.shortCode} on WhatsApp`}
                            title="Share on WhatsApp"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-950 dark:text-emerald-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/50"
                          >
                            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>

                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(link)}
                                disabled={isBusy}
                                aria-label={`Edit ${link.shortCode}`}
                                title="Edit destination URL, expiry, or password (Admin)"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/60 dark:hover:text-blue-300"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(link.shortCode)}
                                disabled={isBusy}
                                aria-label={`Delete ${link.shortCode}`}
                                title="Remove link (Admin)"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-red-800 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin Edit Link Modal */}
      {isAdmin && editingLink && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-link-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h2
                  id="edit-link-modal-title"
                  className="text-lg font-bold text-slate-950 dark:text-white"
                >
                  Edit Link ·{' '}
                  <span className="font-mono text-blue-700 dark:text-blue-400">
                    /{editingLink.shortCode}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Update the destination URL, expiry date, or password protection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLink(null)}
                aria-label="Close edit dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} noValidate className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="edit-long-url"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Destination URL
                </label>
                <input
                  id="edit-long-url"
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-expiry-date"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Expiry Date (leave blank for no expiry)
                </label>
                <input
                  id="edit-expiry-date"
                  type="datetime-local"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-link-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  {editingLink.hasPassword
                    ? 'New Link Password (leave blank to keep existing)'
                    : 'Set Link Password (optional)'}
                </label>
                <input
                  id="edit-link-password"
                  type="password"
                  value={editPassword}
                  disabled={clearPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
                />
                {editingLink.hasPassword && (
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={(e) => setClearPassword(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700"
                    />
                    <span>Remove existing password protection</span>
                  </label>
                )}
              </div>

              {editError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
