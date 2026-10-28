import { useState } from "react";
import { Eye, EyeOff, Flag, Pencil, Trash2, EllipsisVertical } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Composer } from "@/components/chat/Composer";
import { PersonLink, iconBtn } from "@/components/chat/bits";
import { RenderBody, nameOf, tokensToPlain } from "@/lib/chatText";
import { clock } from "@/lib/chatTime";
import { errMsg } from "@/hooks/useChat";
import { api } from "@/api/client";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;
const EDIT_MS = 24 * 3600e3;

/**
 * One line of the live room. `grouped` = same person as the line above within 5 minutes: no avatar or name, just the text
 * (its time shows on hover). Own posts can be edited/deleted for 24 h, other people's reported, admins can hide.
 */
export function RoomMessage({ post, people, admin, grouped, highlighted, onChanged, onReport }) {
  const [editing, setEditing] = useState(false);
  const [acts, setActs] = useState(false);
  const [err, setErr] = useState("");
  const author = people[post.author_player_id];
  const gone = post.removed && !admin;
  const canEdit = post.mine && !post.removed && Date.now() - new Date(post.created_date).getTime() < EDIT_MS;
  const act = async (fn) => {
    setErr("");
    try {
      await fn();
      setActs(false);
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const hasActs = !gone;
  return (
    <li
      id={`p-${post.id}`}
      data-testid="room-post"
      data-highlighted={highlighted ? "true" : undefined}
      className={`group relative flex gap-3 pl-3 pr-10 pb-0.5 transition-colors duration-700 hover:bg-secondary/40 ${grouped ? "pt-0.5" : "pt-3"} ${highlighted ? "bg-brand/20 outline outline-2 -outline-offset-2 outline-brand" : ""}`}
    >
      {grouped ? (
        <span className="h-5 w-9 shrink-0 whitespace-nowrap pt-1 text-right font-mono text-[9px] leading-4 text-transparent group-hover:text-muted-foreground" aria-hidden="true">{clock(post.created_date)}</span>
      ) : gone ? (
        <span className="mt-0.5 h-9 w-9 shrink-0 rounded-sm border border-dashed border-border" aria-hidden="true" />
      ) : (
        <Avatar name={nameOf(author)} src={author?.avatar_url} size={36} />
      )}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-tight">
            {gone ? <span className="text-muted-foreground">Removed</span> : <PersonLink person={author} />}
            <time dateTime={post.created_date} className="font-mono text-[11px] text-muted-foreground">{clock(post.created_date)}</time>
            {admin && post.hidden && <span className="font-mono text-[10px] uppercase text-destructive">hidden</span>}
            {admin && post.deleted && <span className="font-mono text-[10px] uppercase text-muted-foreground">deleted by author</span>}
          </p>
        )}
        {editing ? (
          <div className="mt-1">
            <Composer
              id={`edit-${post.id}`}
              buttonLabel="Save"
              placeholder="Edit message"
              {...(() => {
                const t = tokensToPlain(post.body, people);
                return { initialText: t.text, initialMentions: t.mentions };
              })()}
              autoFocus
              rows={2}
              onCancel={() => setEditing(false)}
              onSend={async (body) => {
                await call("editPost", { id: post.id, body });
                setEditing(false);
                onChanged();
              }}
            />
          </div>
        ) : gone ? (
          <p className="text-sm italic text-muted-foreground">[removed]</p>
        ) : (
          <p className={`text-sm leading-snug ${post.removed ? "opacity-60" : ""}`}>
            <RenderBody body={post.body} people={people} />
            {post.edited_at && <span className="ml-1.5 font-mono text-[10px] italic text-muted-foreground">(edited)</span>}
          </p>
        )}
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        {acts && !editing && (
          <div className="-ml-2.5 flex flex-wrap items-center">
            {canEdit && (
              <button type="button" className={iconBtn} onClick={() => { setActs(false); setEditing(true); }}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit
              </button>
            )}
            {post.mine && !post.removed && (
              <button type="button" className={iconBtn} onClick={() => window.confirm("Delete this message?") && act(() => call("deletePost", { id: post.id }))}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete
              </button>
            )}
            {!post.mine && !post.removed && (
              <button type="button" className={iconBtn} onClick={() => { setActs(false); onReport(post.id); }}>
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />Report
              </button>
            )}
            {admin && !post.mine && !post.hidden && (
              <button type="button" className={`${iconBtn} text-destructive`} onClick={() => act(() => call("deletePost", { id: post.id }))}>
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />Hide
              </button>
            )}
            {admin && post.hidden && (
              <button type="button" className={iconBtn} onClick={() => act(() => call("deletePost", { id: post.id, restore: true }))}>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />Unhide
              </button>
            )}
          </div>
        )}
      </div>
      {hasActs && !editing && (
        <button
          type="button"
          aria-label="Message options"
          aria-expanded={acts}
          onClick={() => setActs((v) => !v)}
          className="absolute right-1 top-0 inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground opacity-60 hover:bg-secondary hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
