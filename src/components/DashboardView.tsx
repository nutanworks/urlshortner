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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="dashboard-heading"
            className="text-2xl font-bold tracking-tight text-slate-50"
          >
            Shortened Links Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {isAdmin
              ? 'Admin permissions enabled · You can inspect, edit destination URLs/expiry, and remove links across both shards.'
              : 'Standard User permissions · You can view and shorten links. Editing or deleting links requires an Admin account.'}
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400 tabular-nums">
          Showing {filteredLinks.length} of {links.length} links
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
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
            placeholder="Search by code, URL, or owner email..."
            className="h-10 w-full rounded-lg border border-slate-800 bg-[#0F131E] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </div>

        {/* Segmented Shard Filter */}
        <div
          role="group"
          aria-label="Filter by database shard"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0F131E] p-1 self-start"
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
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Links Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800/90 bg-[#0F131E]">
        {isLoading ? (
          <div className="divide-y divide-slate-800/70 p-4">
            {[1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="flex h-12 items-center justify-between gap-4 py-3"
              >
                <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
                <div className="h-4 w-64 animate-pulse rounded bg-slate-800" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-800" />
              </div>
            ))}
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-200">
              {links.length === 0
                ? 'No shortened links yet.'
                : 'No links match your current search or shard filter.'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {links.length === 0
                ? 'Shorten your first URL to populate DB 1 and DB 2 shards.'
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
              className="mt-4 inline-flex items-center rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:from-violet-500 hover:to-indigo-500"
            >
              {links.length === 0 ? 'Shorten First URL' : 'Reset Filters'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-[#131826] text-xs font-semibold text-slate-400">
                  <th className="px-4 py-3.5">Short Link</th>
                  <th className="px-4 py-3.5">Destination & Owner</th>
                  <th className="px-4 py-3.5">Shard & Status</th>
                  <th className="px-4 py-3.5 text-right">Clicks</th>
                  <th className="px-4 py-3.5">Created</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
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
                      className="transition-colors hover:bg-slate-800/35"
                    >
                      <td className="px-4 py-3 font-mono text-xs sm:text-sm whitespace-nowrap">
                        <a
                          href={`/${link.shortCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-violet-300 hover:text-violet-200"
                        >
                          <span>{link.shortUrl}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                        </a>
                      </td>

                      <td className="max-w-xs px-4 py-3 text-xs sm:text-sm">
                        <div
                          className="truncate text-slate-200"
                          title={link.longUrl}
                        >
                          {link.longUrl}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="truncate">{link.userEmail}</span>
                          {link.hasPassword && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-400">Locked</span>
                            </>
                          )}
                          {link.expiryDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  link.isExpired
                                    ? 'text-red-400'
                                    : 'text-slate-400'
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

                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        <span
                          className={
                            link.shardId === 'DB_1'
                              ? 'text-indigo-300 font-medium'
                              : 'text-blue-300 font-medium'
                          }
                        >
                          {link.shardLabel}
                        </span>
                        <span aria-hidden="true" className="mx-1.5 text-slate-600">
                          ·
                        </span>
                        <span
                          className={
                            link.cachedInRedis
                              ? 'text-emerald-400'
                              : 'text-slate-500'
                          }
                        >
                          {link.cachedInRedis ? 'Redis Warm' : 'Cold'}
                        </span>
                      </td>

                      <td
                        data-testid={`clicks-count-${link.shortCode}`}
                        className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-100 tabular-nums"
                      >
                        {link.clicks}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap tabular-nums">
                        {formattedDate}
                      </td>

                      <td className="px-4 py-3 text-right">
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
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-700/80 bg-[#141A29] px-2.5 text-xs font-medium text-indigo-300 transition-colors hover:border-indigo-500/60 hover:text-indigo-200 disabled:opacity-40 whitespace-nowrap"
                          >
                            <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Hit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopy(link.shortCode)}
                            aria-label={`Copy short link for ${link.shortCode}`}
                            title="Copy shareable redirect link"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/80 bg-[#141A29] text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
                          >
                            {copiedCode === link.shortCode ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/80 bg-[#141A29] text-emerald-300 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10"
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
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/80 bg-[#141A29] text-slate-300 transition-colors hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(link.shortCode)}
                                disabled={isBusy}
                                aria-label={`Delete ${link.shortCode}`}
                                title="Remove link (Admin)"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/80 bg-[#141A29] text-slate-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#0F131E] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="edit-link-modal-title"
                  className="text-lg font-bold text-slate-50"
                >
                  Edit Link · <span className="font-mono text-violet-300">/{editingLink.shortCode}</span>
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Update the destination URL, expiry schedule, or password protection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingLink(null)}
                aria-label="Close edit dialog"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} noValidate className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="edit-long-url"
                  className="block text-xs font-medium text-slate-300"
                >
                  Destination URL
                </label>
                <input
                  id="edit-long-url"
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-800 bg-[#080A10] px-3 text-sm text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-expiry-date"
                  className="block text-xs font-medium text-slate-300"
                >
                  Expiry Date (leave blank for no expiry)
                </label>
                <input
                  id="edit-expiry-date"
                  type="datetime-local"
                  value={editExpiry}
                  onChange={(e) => setEditExpiry(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-800 bg-[#080A10] px-3 font-mono text-xs text-slate-100 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-link-password"
                  className="block text-xs font-medium text-slate-300"
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
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-800 bg-[#080A10] px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50"
                />
                {editingLink.hasPassword && (
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={(e) => setClearPassword(e.target.checked)}
                      className="rounded border-slate-700 bg-[#080A10]"
                    />
                    <span>Remove existing password protection</span>
                  </label>
                )}
              </div>

              {editError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingLink(null)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60"
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
