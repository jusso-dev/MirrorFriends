import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import {
  Activity,
  Bell,
  Bot,
  Clock,
  Check,
  ChevronRight,
  CirclePause,
  Copy,
  DoorOpen,
  FileUp,
  Lightbulb,
  Loader2,
  MessageCircle,
  NotebookTabs,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  Shield,
  Sparkles,
  Target,
  Trash2,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  api,
  AccessInvite,
  AgentSchedule,
  AssistantMessage,
  ChatImportAnalysis,
  ChatImportMemoryDraft,
  ConversationSeed,
  ConversationSeedAnalysis,
  ConversationSeedDraft,
  ConversationSeedPriority,
  ConversationSeedSource,
  ConversationSeedTone,
  ConversationSummary,
  FriendGoalStatus,
  FriendGoalSummary,
  FriendSummary,
  Id,
  Memory,
  Mirror,
  MirrorBehaviour,
  MirrorMessage,
  UsageEstimate,
  User,
} from "./lib/api";

type ViewKey = "today" | "mirror" | "memory" | "friends" | "ask" | "settings";

const memoryTypes: Memory["type"][] = [
  "fact",
  "preference",
  "goal",
  "project",
  "relationship",
  "boundary",
  "opinion",
  "task",
];

const chatImportSources = [
  "iMessage",
  "WhatsApp",
  "Discord",
  "Signal",
  "Telegram",
  "Slack",
  "Instagram DM",
  "Facebook Messenger",
  "Email",
  "Other chat export",
];

const conversationSeedSources: Array<{
  value: ConversationSeedSource;
  label: string;
}> = [
  { value: "video", label: "Video" },
  { value: "article", label: "Article" },
  { value: "podcast", label: "Podcast" },
  { value: "news", label: "News" },
  { value: "event", label: "Event" },
  { value: "personal_note", label: "Personal note" },
  { value: "friend_note", label: "Friend note" },
  { value: "other", label: "Other" },
];

const conversationSeedPriorities: ConversationSeedPriority[] = [
  "low",
  "normal",
  "high",
];

const conversationSeedTones: ConversationSeedTone[] = [
  "casual",
  "curious",
  "practical",
  "funny",
  "supportive",
];

const conversationSeedExpiryOptions = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "none", label: "No expiry" },
];

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Activity }> = [
  { key: "today", label: "Today", icon: Activity },
  { key: "mirror", label: "Mirror", icon: Bot },
  { key: "memory", label: "Memory", icon: NotebookTabs },
  { key: "friends", label: "Friends", icon: UsersRound },
  { key: "ask", label: "Ask", icon: Sparkles },
  { key: "settings", label: "Settings", icon: Settings },
];

export function App() {
  const auth = useConvexAuth();

  if (auth.isLoading) {
    return <LoadingScreen label="Opening MirrorFriends" />;
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  return <AuthedApp />;
}

function AuthScreen() {
  const { signIn } = useAuthActions();
  const inviteFromUrl = useMemo(() => {
    return new URLSearchParams(window.location.search).get("invite")?.trim().toUpperCase() ?? "";
  }, []);
  const emailFromUrl = useMemo(() => {
    return new URLSearchParams(window.location.search).get("email")?.trim().toLowerCase() ?? "";
  }, []);
  const [mode, setMode] = useState<"signIn" | "signUp">(
    inviteFromUrl ? "signUp" : "signIn",
  );
  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitePreview = useQuery(
    api.access.getPortalInvite,
    inviteCode ? { inviteCode } : "skip",
  );

  useEffect(() => {
    if (!email && invitePreview?.email) setEmail(invitePreview.email);
  }, [email, invitePreview?.email]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const params: Record<string, string> = {
        email,
        password,
        flow: mode,
      };
      if (mode === "signUp" && inviteCode) params.inviteCode = inviteCode;
      await signIn("password", params);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-copy">
        <p className="eyebrow">Private AI mirror network</p>
        <h1>Let your Mirrors find signal between friends.</h1>
        <p>
          Invite trusted friends, shape your personal Mirror, and watch private
          agents surface useful overlap without exposing private memory.
        </p>
      </section>

      <section className="auth-panel" aria-label="Sign in">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img src="/assets/mirrorfriends-mark.svg" alt="" />
          </div>
          <div>
            <strong>MirrorFriends</strong>
            <span>Private mirror network</span>
          </div>
        </div>

        <div className="segmented" aria-label="Auth mode">
          <button
            type="button"
            className={mode === "signIn" ? "selected" : ""}
            onClick={() => setMode("signIn")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signUp" ? "selected" : ""}
            onClick={() => setMode("signUp")}
          >
            Join invite
          </button>
        </div>

        <form className="form-stack" onSubmit={submit}>
          {mode === "signUp" && (
            <label>
              Invite code
              <input
                autoComplete="off"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="MF-ABCD-EFGH-JKLM"
              />
            </label>
          )}
          {mode === "signUp" && inviteCode && invitePreview && (
            <InvitePreview preview={invitePreview} />
          )}
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              minLength={8}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-action" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={18} /> : <DoorOpen size={18} />}
            {mode === "signUp" ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="auth-note">
          The configured admin email can create the first account without an
          invite. Everyone else needs a valid link.
        </p>
      </section>
    </main>
  );
}

function InvitePreview({ preview }: { preview: { valid: boolean; reason: string | null; email?: string; role?: string; expiresAt?: number } }) {
  if (!preview.valid) {
    return (
      <p className="form-error">
        Invite is {preview.reason?.replaceAll("_", " ") ?? "not valid"}.
      </p>
    );
  }
  return (
    <p className="inline-note">
      Valid invite{preview.email ? ` for ${preview.email}` : ""}. Role:{" "}
      {preview.role ?? "user"}.
    </p>
  );
}

function AuthedApp() {
  const current = useQuery(api.users.getCurrentUser, {});

  if (current === undefined) {
    return <LoadingScreen label="Loading workspace" />;
  }

  if (current === null || !current.user.onboardingComplete || !current.mirror) {
    return <Onboarding />;
  }

  return <Workspace user={current.user} mirror={current.mirror} />;
}

function Onboarding() {
  const complete = useMutation(api.users.completeOnboarding);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    nickname: "",
    bio: "",
    interests: "",
    work: "",
    communicationStyle: "",
    thingsToKnow: "",
    thingsToAvoid: "",
    privacyBoundaries: "",
    mirrorName: "",
    avatarEmoji: "M",
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await complete({
        name: form.name.trim(),
        nickname: optional(form.nickname),
        bio: optional(form.bio),
        interests: splitList(form.interests),
        work: optional(form.work),
        communicationStyle: optional(form.communicationStyle),
        thingsToKnow: optional(form.thingsToKnow),
        thingsToAvoid: optional(form.thingsToAvoid),
        privacyBoundaries: splitList(form.privacyBoundaries),
        mirrorName: optional(form.mirrorName),
        avatarEmoji: optional(form.avatarEmoji),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-header">
        <p className="eyebrow">First run</p>
        <h1>Shape the Mirror before it starts talking.</h1>
      </section>
      <form className="onboarding-form" onSubmit={submit}>
        <label>
          Your name
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Nickname
          <input
            value={form.nickname}
            onChange={(event) => setForm({ ...form, nickname: event.target.value })}
          />
        </label>
        <label>
          Mirror name
          <input
            value={form.mirrorName}
            onChange={(event) => setForm({ ...form, mirrorName: event.target.value })}
          />
        </label>
        <label>
          Marker
          <input
            maxLength={3}
            value={form.avatarEmoji}
            onChange={(event) => setForm({ ...form, avatarEmoji: event.target.value })}
          />
        </label>
        <label className="span-2">
          Public bio
          <textarea
            value={form.bio}
            onChange={(event) => setForm({ ...form, bio: event.target.value })}
          />
        </label>
        <label className="span-2">
          Interests
          <input
            placeholder="AI, design, trail running"
            value={form.interests}
            onChange={(event) => setForm({ ...form, interests: event.target.value })}
          />
        </label>
        <label className="span-2">
          Current work
          <textarea
            value={form.work}
            onChange={(event) => setForm({ ...form, work: event.target.value })}
          />
        </label>
        <label className="span-2">
          Communication style
          <textarea
            value={form.communicationStyle}
            onChange={(event) =>
              setForm({ ...form, communicationStyle: event.target.value })
            }
          />
        </label>
        <label className="span-2">
          Private context
          <textarea
            value={form.thingsToKnow}
            onChange={(event) =>
              setForm({ ...form, thingsToKnow: event.target.value })
            }
          />
        </label>
        <label className="span-2">
          Boundaries
          <input
            placeholder="No health details, no family details"
            value={form.privacyBoundaries}
            onChange={(event) =>
              setForm({ ...form, privacyBoundaries: event.target.value })
            }
          />
        </label>
        {error && <p className="form-error span-2">{error}</p>}
        <button className="primary-action span-2" disabled={busy} type="submit">
          {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          Create Mirror
        </button>
      </form>
    </main>
  );
}

function Workspace({ user, mirror }: { user: User; mirror: Mirror }) {
  const { signOut } = useAuthActions();
  const [view, setView] = useState<ViewKey>("today");
  const notifications = useQuery(api.notifications.listNotifications, {
    unreadOnly: true,
    limit: 10,
  });

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img src="/assets/mirrorfriends-mark.svg" alt="" />
          </div>
          <div>
            <strong>MirrorFriends</strong>
            <span>{user.nickname ?? user.name ?? user.email ?? "Workspace"}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Workspace">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={view === item.key ? "active" : ""}
                onClick={() => setView(item.key)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="mini-status">
            <span className={user.mirrorPaused ? "status-dot paused" : "status-dot"} />
            {user.mirrorPaused ? "Paused" : "Active"}
          </div>
          <button className="ghost-button" type="button" onClick={() => signOut()}>
            <DoorOpen size={17} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-surface">
        <header className="topbar">
          <div>
            <p className="eyebrow">Agent workspace</p>
            <h1>{mirror.name}</h1>
          </div>
          <div className="topbar-actions">
            <NotificationBadge count={notifications?.length ?? 0} />
          </div>
        </header>

        <div className="mobile-tabs" aria-label="Workspace tabs">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={view === item.key ? "active" : ""}
                onClick={() => setView(item.key)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </div>

        {view === "today" && <TodayView mirror={mirror} />}
        {view === "mirror" && <MirrorView />}
        {view === "memory" && <MemoryView user={user} />}
        {view === "friends" && <FriendsView />}
        {view === "ask" && <AskView />}
        {view === "settings" && <SettingsView user={user} />}
      </main>
    </div>
  );
}

function TodayView({ mirror }: { mirror: Mirror }) {
  const conversations = useQuery(api.conversations.listMirrorConversations, { limit: 20 });
  const friends = useQuery(api.friends.listMyFriends, {});
  const usage = useQuery(api.settings.getAiUsageEstimate, {});
  const notifications = useQuery(api.notifications.listNotifications, { limit: 5 });
  const runConversation = useAction(api.conversations.generateConversationNow);
  const markRead = useMutation(api.notifications.markNotificationRead);
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConversationId =
    selectedId ?? conversations?.[0]?.conversation._id ?? null;
  const thread = useQuery(
    api.conversations.listConversationMessages,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip",
  );
  const activeFriendship = friends?.find((friend) => friend.friendship.status === "active");

  useEffect(() => {
    if (!selectedId && conversations?.[0]) {
      setSelectedId(conversations[0].conversation._id);
    }
  }, [conversations, selectedId]);

  async function triggerChat() {
    if (!activeFriendship) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runConversation({
        friendshipId: activeFriendship.friendship._id,
      });
      setSelectedId(result.conversationId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-grid today-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Today</p>
          <h2>{mirror.name} is {mirror.behaviourVersion > 0 ? "ready" : "learning"}</h2>
          <p>{mirror.shareableProfile || "The shareable profile will appear after behaviour generation runs."}</p>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={!activeFriendship || busy}
          onClick={triggerChat}
        >
          {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
          Simulate next chat
        </button>
      </section>

      <section className="metric-strip">
        <Metric label="Conversations" value={conversations?.length ?? 0} />
        <Metric label="Friends" value={friends?.length ?? 0} />
        <Metric label="AI calls" value={usage?.calls ?? 0} />
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className="conversation-layout">
        <div className="conversation-list">
          <SectionTitle icon={MessageCircle} title="Daily chats" />
          {conversations === undefined && <SkeletonRows count={4} />}
          {conversations?.length === 0 && (
            <EmptyState title="No chats yet" text="Create a friendship, then simulate the next scheduled-style exchange." />
          )}
          {conversations?.map((conversation) => (
            <ConversationButton
              key={conversation.conversation._id}
              conversation={conversation}
              active={selectedConversationId === conversation.conversation._id}
              onSelect={() => setSelectedId(conversation.conversation._id)}
            />
          ))}
        </div>

        <div className="chat-panel">
          <SectionTitle icon={Bot} title="Agent transcript" />
          {thread === undefined && selectedConversationId && <SkeletonRows count={5} />}
          {!selectedConversationId && (
            <EmptyState title="Waiting for a conversation" text="Scheduled windows or Simulate next chat will fill this stream." />
          )}
          {thread?.messages.length === 0 && (
            <EmptyState title="No messages saved" text="This conversation has not produced messages yet." />
          )}
          <div className="message-stack">
            {thread?.messages.map((message) => (
              <MirrorBubble
                key={message._id}
                message={message}
                ownMirrorId={mirror._id}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="notification-panel">
        <SectionTitle icon={Bell} title="Signals" />
        {notifications === undefined && <SkeletonRows count={3} />}
        {notifications?.length === 0 && (
          <EmptyState title="No signals" text="New connections and completed chats land here." />
        )}
        {notifications?.map((notification) => (
          <button
            key={notification._id}
            className="notification-row"
            type="button"
            onClick={() => markRead({ notificationId: notification._id })}
          >
            <span className={notification.read ? "status-dot muted" : "status-dot"} />
            <span>
              <strong>{notification.title}</strong>
              <small>{notification.body}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </section>
    </div>
  );
}

function MirrorView() {
  const data = useQuery(api.mirrors.getMyMirror, {});
  const update = useMutation(api.mirrors.updateMirrorProfile);
  const regenerate = useAction(api.mirrors.generateMirrorBehaviour);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (data === undefined) return <SkeletonRows count={8} />;

  return (
    <MirrorEditor
      mirror={data.mirror}
      behaviour={data.behaviour}
      busy={busy}
      message={message}
      onSave={async (values) => {
        setBusy(true);
        setMessage(null);
        try {
          await update(values);
          setMessage("Saved. Behaviour regeneration is queued.");
        } catch (err) {
          setMessage(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      onRegenerate={async () => {
        setBusy(true);
        setMessage(null);
        try {
          const result = await regenerate({});
          setMessage(`Behaviour version ${result.version} is active.`);
        } catch (err) {
          setMessage(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function MirrorEditor({
  mirror,
  behaviour,
  busy,
  message,
  onSave,
  onRegenerate,
}: {
  mirror: Mirror;
  behaviour: MirrorBehaviour | null;
  busy: boolean;
  message: string | null;
  onSave: (values: Partial<Mirror>) => Promise<void>;
  onRegenerate: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: mirror.name,
    avatarEmoji: mirror.avatarEmoji ?? "M",
    personality: mirror.personality ?? "",
    communicationStyle: mirror.communicationStyle ?? "",
    interests: mirror.interests.join(", "),
    goals: mirror.goals.join(", "),
    boundaries: mirror.boundaries.join(", "),
    thingsToKnow: mirror.thingsToKnow ?? "",
    thingsToAvoid: mirror.thingsToAvoid ?? "",
  });

  return (
    <div className="view-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Mirror tuning</p>
          <h2>{mirror.name}</h2>
          <p>{mirror.shareableProfile || "No shareable profile has been generated yet."}</p>
        </div>
        <button className="secondary-action" type="button" disabled={busy} onClick={onRegenerate}>
          {busy ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
          Regenerate
        </button>
      </section>

      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            name: form.name.trim(),
            avatarEmoji: optional(form.avatarEmoji),
            personality: optional(form.personality),
            communicationStyle: optional(form.communicationStyle),
            interests: splitList(form.interests),
            goals: splitList(form.goals),
            boundaries: splitList(form.boundaries),
            thingsToKnow: optional(form.thingsToKnow),
            thingsToAvoid: optional(form.thingsToAvoid),
          });
        }}
      >
        <label>
          Name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Marker
          <input
            maxLength={3}
            value={form.avatarEmoji}
            onChange={(event) => setForm({ ...form, avatarEmoji: event.target.value })}
          />
        </label>
        <label className="span-2">
          Personality
          <textarea
            value={form.personality}
            onChange={(event) => setForm({ ...form, personality: event.target.value })}
          />
        </label>
        <label className="span-2">
          Communication style
          <textarea
            value={form.communicationStyle}
            onChange={(event) =>
              setForm({ ...form, communicationStyle: event.target.value })
            }
          />
        </label>
        <label className="span-2">
          Interests
          <input
            value={form.interests}
            onChange={(event) => setForm({ ...form, interests: event.target.value })}
          />
        </label>
        <label className="span-2">
          Goals
          <input value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} />
        </label>
        <label className="span-2">
          Boundaries
          <input
            value={form.boundaries}
            onChange={(event) => setForm({ ...form, boundaries: event.target.value })}
          />
        </label>
        <label className="span-2">
          Things to know
          <textarea
            value={form.thingsToKnow}
            onChange={(event) =>
              setForm({ ...form, thingsToKnow: event.target.value })
            }
          />
        </label>
        <label className="span-2">
          Things to avoid
          <textarea
            value={form.thingsToAvoid}
            onChange={(event) =>
              setForm({ ...form, thingsToAvoid: event.target.value })
            }
          />
        </label>
        {message && <p className="inline-note span-2">{message}</p>}
        <button className="primary-action span-2" type="submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          Save Mirror
        </button>
      </form>

      <section className="rules-panel">
        <SectionTitle icon={Shield} title="Active behaviour" />
        {!behaviour && <EmptyState title="No active version" text="Save or regenerate to create a behaviour profile." />}
        {behaviour && (
          <div className="rule-stack">
            <p>{behaviour.systemPrompt}</p>
            <RuleList title="Communication" items={behaviour.communicationRules} />
            <RuleList title="Privacy" items={behaviour.privacyRules} />
          </div>
        )}
      </section>
    </div>
  );
}

function MemoryView({ user }: { user: User }) {
  const memories = useQuery(api.memories.listMyMemories, {});
  const addMemory = useMutation(api.memories.addMemory);
  const archiveMemory = useMutation(api.memories.archiveMemory);
  const analyzeImport = useAction(api.memories.analyzeChatLogImport);
  const applyImport = useMutation(api.memories.applyChatLogImport);
  const [type, setType] = useState<Memory["type"]>("fact");
  const [visibility, setVisibility] = useState<Memory["visibility"]>("shareable");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerHandle, setOwnerHandle] = useState(
    user.nickname ?? user.name ?? user.email ?? "",
  );
  const [otherHandle, setOtherHandle] = useState("");
  const [sourceLabel, setSourceLabel] = useState(chatImportSources[0]);
  const [chatLog, setChatLog] = useState("");
  const [importDraft, setImportDraft] = useState<ChatImportAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [updateProfileFromImport, setUpdateProfileFromImport] = useState(true);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addMemory({ type, visibility, content });
      setContent("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    return {
      shareable: memories?.filter((memory) => memory.visibility === "shareable") ?? [],
      private: memories?.filter((memory) => memory.visibility === "private") ?? [],
    };
  }, [memories]);

  async function analyzeChatImport(event: FormEvent) {
    event.preventDefault();
    setAnalyzing(true);
    setImportMessage(null);
    setImportDraft(null);
    try {
      const result = await analyzeImport({
        chatLog,
        ownerHandle: optional(ownerHandle),
        otherHandle: optional(otherHandle),
        sourceLabel: optional(sourceLabel),
      });
      setImportDraft(result);
      setImportMessage("Review the extracted profile notes before saving.");
    } catch (err) {
      setImportMessage(errorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveChatImport() {
    if (!importDraft) return;
    setSavingImport(true);
    setImportMessage(null);
    try {
      const result = await applyImport({
        updateProfile: updateProfileFromImport,
        profile: importDraft.profile,
        memories: importDraft.memories,
      });
      setChatLog("");
      setImportDraft(null);
      setSourceLabel(chatImportSources[0]);
      setOtherHandle("");
      setImportMessage(
        `Imported ${result.inserted} memories${
          result.profileUpdated ? " and updated your Mirror profile" : ""
        }.`,
      );
    } catch (err) {
      setImportMessage(errorMessage(err));
    } finally {
      setSavingImport(false);
    }
  }

  function updateImportProfile(values: Partial<ChatImportAnalysis["profile"]>) {
    setImportDraft((draft) =>
      draft ? { ...draft, profile: { ...draft.profile, ...values } } : draft,
    );
  }

  function updateImportMemory(index: number, values: Partial<ChatImportMemoryDraft>) {
    setImportDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        memories: draft.memories.map((memory, i) =>
          i === index ? { ...memory, ...values } : memory,
        ),
      };
    });
  }

  function removeImportMemory(index: number) {
    setImportDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        memories: draft.memories.filter((_, i) => i !== index),
      };
    });
  }

  return (
    <div className="view-grid memory-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Memory</p>
          <h2>What your Mirror can draw from</h2>
          <p>Shareable memory can inform friend conversations. Private memory is for Ask My Mirror.</p>
        </div>
      </section>

      <ConversationSeedPanel />

      <section className="chat-import-panel">
        <SectionTitle icon={FileUp} title="Import chat log" />
        <form className="chat-import-form" onSubmit={analyzeChatImport}>
          <div className="import-field-row">
            <label>
              Your name or handle
              <input
                value={ownerHandle}
                onChange={(event) => setOwnerHandle(event.target.value)}
                placeholder="Name used in the chat"
              />
            </label>
            <label>
              Other person
              <input
                value={otherHandle}
                onChange={(event) => setOtherHandle(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Source
              <select
                value={sourceLabel}
                onChange={(event) => setSourceLabel(event.target.value)}
              >
                {chatImportSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Chat log
            <textarea
              className="chat-log-textarea"
              required
              value={chatLog}
              onChange={(event) => setChatLog(event.target.value)}
              placeholder="Paste an exported conversation. The raw transcript is analyzed, then discarded when you save."
            />
          </label>
          <div className="import-actions">
            <button
              className="primary-action"
              type="submit"
              disabled={analyzing || chatLog.trim().length < 200}
            >
              {analyzing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Analyze log
            </button>
            <span>{chatLog.trim().length.toLocaleString()} characters</span>
          </div>
        </form>
        {importMessage && <p className="inline-note">{importMessage}</p>}
        {importDraft && (
          <ChatImportReview
            draft={importDraft}
            updateProfile={updateProfileFromImport}
            saving={savingImport}
            onToggleUpdateProfile={setUpdateProfileFromImport}
            onProfileChange={updateImportProfile}
            onMemoryChange={updateImportMemory}
            onRemoveMemory={removeImportMemory}
            onSave={saveChatImport}
          />
        )}
      </section>

      <form className="memory-composer" onSubmit={submit}>
        <div className="control-row">
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value as Memory["type"])}>
              {memoryTypes.map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as Memory["visibility"])}
            >
              <option value="shareable">Shareable</option>
              <option value="private">Private</option>
            </select>
          </label>
        </div>
        <label>
          Content
          <textarea
            required
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-action" type="submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          Add memory
        </button>
      </form>

      <MemoryColumn
        title="Shareable"
        memories={grouped.shareable}
        loading={memories === undefined}
        onArchive={(memoryId) => archiveMemory({ memoryId, archived: true })}
      />
      <MemoryColumn
        title="Private"
        memories={grouped.private}
        loading={memories === undefined}
        onArchive={(memoryId) => archiveMemory({ memoryId, archived: true })}
      />
    </div>
  );
}

function ChatImportReview({
  draft,
  updateProfile,
  saving,
  onToggleUpdateProfile,
  onProfileChange,
  onMemoryChange,
  onRemoveMemory,
  onSave,
}: {
  draft: ChatImportAnalysis;
  updateProfile: boolean;
  saving: boolean;
  onToggleUpdateProfile: (value: boolean) => void;
  onProfileChange: (values: Partial<ChatImportAnalysis["profile"]>) => void;
  onMemoryChange: (index: number, values: Partial<ChatImportMemoryDraft>) => void;
  onRemoveMemory: (index: number) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="chat-import-review">
      <div className="import-review-header">
        <div>
          <strong>Import draft</strong>
          <span>
            {draft.analyzedCharacterCount.toLocaleString()} of{" "}
            {draft.rawCharacterCount.toLocaleString()} characters analyzed
            {draft.truncated ? " (truncated)" : ""}
          </span>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={updateProfile}
            onChange={(event) => onToggleUpdateProfile(event.target.checked)}
          />
          Update Mirror profile
        </label>
      </div>

      <div className="import-profile-grid">
        <label>
          Communication style
          <textarea
            value={draft.profile.communicationStyle ?? ""}
            onChange={(event) =>
              onProfileChange({ communicationStyle: event.target.value })
            }
          />
        </label>
        <label>
          Personality
          <textarea
            value={draft.profile.personality ?? ""}
            onChange={(event) => onProfileChange({ personality: event.target.value })}
          />
        </label>
        <label>
          Interests
          <input
            value={draft.profile.interests.join(", ")}
            onChange={(event) =>
              onProfileChange({ interests: splitList(event.target.value) })
            }
          />
        </label>
        <label>
          Goals
          <input
            value={draft.profile.goals.join(", ")}
            onChange={(event) => onProfileChange({ goals: splitList(event.target.value) })}
          />
        </label>
        <label className="span-2">
          Private context
          <textarea
            value={draft.profile.thingsToKnow ?? ""}
            onChange={(event) => onProfileChange({ thingsToKnow: event.target.value })}
          />
        </label>
      </div>

      {draft.safetyNotes.length > 0 && (
        <div className="import-safety">
          {draft.safetyNotes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}

      <div className="import-memory-list">
        <div className="import-memory-heading">
          <strong>Memories to save</strong>
          <span>{draft.memories.length} selected</span>
        </div>
        {draft.memories.length === 0 && (
          <EmptyState title="No memories selected" text="Keep profile updates only, or analyze a longer log." />
        )}
        {draft.memories.map((memory, index) => (
          <article key={`${index}-${memory.content.slice(0, 24)}`} className="import-memory-row">
            <div className="import-memory-controls">
              <label>
                Type
                <select
                  value={memory.type}
                  onChange={(event) =>
                    onMemoryChange(index, { type: event.target.value as Memory["type"] })
                  }
                >
                  {memoryTypes.map((item) => (
                    <option key={item} value={item}>
                      {titleCase(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visibility
                <select
                  value={memory.visibility}
                  onChange={(event) =>
                    onMemoryChange(index, {
                      visibility: event.target.value as Memory["visibility"],
                    })
                  }
                >
                  <option value="private">Private</option>
                  <option value="shareable">Shareable</option>
                </select>
              </label>
              <button
                className="icon-button danger-icon"
                type="button"
                aria-label="Remove imported memory"
                onClick={() => onRemoveMemory(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <textarea
              aria-label="Imported memory"
              value={memory.content}
              onChange={(event) =>
                onMemoryChange(index, { content: event.target.value })
              }
            />
          </article>
        ))}
      </div>

      <div className="import-actions">
        <button
          className="primary-action"
          type="button"
          disabled={saving || (!updateProfile && draft.memories.length === 0)}
          onClick={onSave}
        >
          {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          Save import
        </button>
        <span>Raw pasted text is not stored.</span>
      </div>
    </div>
  );
}

function ConversationSeedPanel() {
  const friends = useQuery(api.friends.listMyFriends, {});
  const seeds = useQuery(api.conversationSeeds.listMyConversationSeeds, {});
  const analyzeSeedSource = useAction(api.conversationSeeds.analyzeConversationSeedSource);
  const createSeed = useMutation(api.conversationSeeds.createConversationSeed);
  const createSeeds = useMutation(api.conversationSeeds.createConversationSeeds);
  const archiveSeed = useMutation(api.conversationSeeds.archiveConversationSeed);
  const activeFriends = useMemo(
    () => friends?.filter((friend) => friend.friendship.status === "active") ?? [],
    [friends],
  );
  const [source, setSource] = useState<ConversationSeedSource>("video");
  const [visibility, setVisibility] = useState<Memory["visibility"]>("shareable");
  const [priority, setPriority] = useState<ConversationSeedPriority>("normal");
  const [tone, setTone] = useState<ConversationSeedTone>("curious");
  const [friendshipId, setFriendshipId] = useState("");
  const [expiryChoice, setExpiryChoice] = useState("30");
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [suggestedAngle, setSuggestedAngle] = useState("");
  const [talkingPoints, setTalkingPoints] = useState("");
  const [ownerIntent, setOwnerIntent] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [analysis, setAnalysis] = useState<ConversationSeedAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [archivingId, setArchivingId] = useState<Id | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFriendshipId = friendshipId ? friendshipId : undefined;

  function seedFromForm(): ConversationSeedDraft {
    return {
      source,
      visibility,
      priority,
      tone,
      title,
      summary,
      suggestedAngle: optional(suggestedAngle),
      talkingPoints: splitLines(talkingPoints),
      sourceUrl: optional(sourceUrl),
      expiresAt: expiryFromChoice(expiryChoice),
    };
  }

  async function saveManualSeed(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await createSeed({
        friendshipId: selectedFriendshipId,
        seed: seedFromForm(),
      });
      setTitle("");
      setSummary("");
      setSuggestedAngle("");
      setTalkingPoints("");
      setSourceUrl("");
      setMessage("Conversation seed saved.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function analyzeSource(event: FormEvent) {
    event.preventDefault();
    setAnalyzing(true);
    setMessage(null);
    setAnalysis(null);
    try {
      const result = await analyzeSeedSource({
        source,
        sourceUrl: optional(sourceUrl),
        content: sourceContent,
        ownerIntent: optional(ownerIntent),
      });
      const expiresAt = expiryFromChoice(expiryChoice);
      setAnalysis({
        ...result,
        seeds: result.seeds.map((seed) => ({
          ...seed,
          source,
          visibility,
          priority: seed.priority ?? priority,
          tone: seed.tone ?? tone,
          sourceUrl: seed.sourceUrl ?? optional(sourceUrl),
          expiresAt,
        })),
      });
      setMessage("Review the extracted talking points before saving.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }

  function updateAnalyzedSeed(index: number, values: Partial<ConversationSeedDraft>) {
    setAnalysis((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        seeds: draft.seeds.map((seed, i) =>
          i === index ? { ...seed, ...values } : seed,
        ),
      };
    });
  }

  function removeAnalyzedSeed(index: number) {
    setAnalysis((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        seeds: draft.seeds.filter((_, i) => i !== index),
      };
    });
  }

  async function saveAnalyzedSeeds() {
    if (!analysis) return;
    setSavingDrafts(true);
    setMessage(null);
    try {
      const result = await createSeeds({
        friendshipId: selectedFriendshipId,
        seeds: analysis.seeds,
      });
      setAnalysis(null);
      setSourceContent("");
      setOwnerIntent("");
      setMessage(`Saved ${result.inserted} conversation seeds.`);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setSavingDrafts(false);
    }
  }

  async function archive(seedId: Id) {
    setArchivingId(seedId);
    setMessage(null);
    try {
      await archiveSeed({ seedId, archived: true });
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <section className="conversation-seed-panel">
      <SectionTitle icon={Lightbulb} title="Conversation seeds" />
      <form className="seed-form" onSubmit={saveManualSeed}>
        <div className="seed-control-grid">
          <label>
            Source
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as ConversationSeedSource)}
            >
              {conversationSeedSources.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Audience
            <select
              value={friendshipId}
              onChange={(event) => setFriendshipId(event.target.value)}
            >
              <option value="">All active friends</option>
              {activeFriends.map((friend) => (
                <option key={friend.friendship._id} value={friend.friendship._id}>
                  {friend.friendMirror?.name ?? friend.friendUser?.name ?? "Friend"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as Memory["visibility"])}
            >
              <option value="shareable">Shareable</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as ConversationSeedPriority)
              }
            >
              {conversationSeedPriorities.map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tone
            <select
              value={tone}
              onChange={(event) => setTone(event.target.value as ConversationSeedTone)}
            >
              {conversationSeedTones.map((item) => (
                <option key={item} value={item}>
                  {titleCase(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expires
            <select
              value={expiryChoice}
              onChange={(event) => setExpiryChoice(event.target.value)}
            >
              {conversationSeedExpiryOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="seed-detail-grid">
          <label>
            Title
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Upcoming launch or article topic"
            />
          </label>
          <label>
            Source URL
            <input
              inputMode="url"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://example.com/story"
            />
          </label>
          <label className="span-2">
            Summary
            <textarea
              required
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Short public-safe summary"
            />
          </label>
          <label>
            Suggested angle
            <textarea
              value={suggestedAngle}
              onChange={(event) => setSuggestedAngle(event.target.value)}
              placeholder="Ask whether they saw it or connect it to a shared interest"
            />
          </label>
          <label>
            Talking points
            <textarea
              value={talkingPoints}
              onChange={(event) => setTalkingPoints(event.target.value)}
              placeholder="One point per line"
            />
          </label>
        </div>

        <div className="seed-actions">
          <button
            className="primary-action"
            type="submit"
            disabled={saving || !title.trim() || !summary.trim()}
          >
            {saving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            Save seed
          </button>
          <span>Private seeds are not used in friend chats.</span>
        </div>
      </form>

      <form className="seed-analysis-form" onSubmit={analyzeSource}>
        <label>
          Paste source material
          <textarea
            className="seed-source-textarea"
            value={sourceContent}
            onChange={(event) => setSourceContent(event.target.value)}
            placeholder="Paste a transcript, article excerpt, event listing, or notes"
          />
        </label>
        <label>
          Intended angle
          <input
            value={ownerIntent}
            onChange={(event) => setOwnerIntent(event.target.value)}
            placeholder="Optional angle for the Mirror"
          />
        </label>
        <div className="seed-actions">
          <button
            className="secondary-action"
            type="submit"
            disabled={analyzing || sourceContent.trim().length < 120}
          >
            {analyzing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Analyze source
          </button>
          <span>{sourceContent.trim().length.toLocaleString()} characters</span>
        </div>
      </form>

      {message && <p className="inline-note">{message}</p>}

      {analysis && (
        <div className="seed-review">
          <div className="import-review-header">
            <div>
              <strong>Seed draft</strong>
              <span>
                {analysis.analyzedCharacterCount.toLocaleString()} of{" "}
                {analysis.rawCharacterCount.toLocaleString()} characters analyzed
                {analysis.truncated ? " (truncated)" : ""}
              </span>
            </div>
            <button
              className="primary-action"
              type="button"
              disabled={savingDrafts || analysis.seeds.length === 0}
              onClick={saveAnalyzedSeeds}
            >
              {savingDrafts ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              Save drafts
            </button>
          </div>
          {analysis.safetyNotes.length > 0 && (
            <div className="import-safety">
              {analysis.safetyNotes.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          )}
          <div className="seed-draft-list">
            {analysis.seeds.length === 0 && (
              <EmptyState title="No useful seeds" text="Try a longer source or add a manual seed." />
            )}
            {analysis.seeds.map((seed, index) => (
              <ConversationSeedDraftRow
                key={`${index}-${seed.title}`}
                seed={seed}
                onChange={(values) => updateAnalyzedSeed(index, values)}
                onRemove={() => removeAnalyzedSeed(index)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="seed-list">
        <div className="import-memory-heading">
          <strong>Active seeds</strong>
          <span>{seeds?.length ?? 0} available</span>
        </div>
        {seeds === undefined && <SkeletonRows count={3} />}
        {seeds?.length === 0 && (
          <EmptyState title="No conversation seeds" text="Save a timely talking point when something is worth raising later." />
        )}
        {seeds?.map((seed) => (
          <ConversationSeedRow
            key={seed._id}
            seed={seed}
            archiving={archivingId === seed._id}
            onArchive={() => archive(seed._id)}
          />
        ))}
      </div>
    </section>
  );
}

function ConversationSeedDraftRow({
  seed,
  onChange,
  onRemove,
}: {
  seed: ConversationSeedDraft;
  onChange: (values: Partial<ConversationSeedDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <article className="seed-draft-row">
      <div className="seed-draft-controls">
        <label>
          Source
          <select
            value={seed.source}
            onChange={(event) =>
              onChange({ source: event.target.value as ConversationSeedSource })
            }
          >
            {conversationSeedSources.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visibility
          <select
            value={seed.visibility}
            onChange={(event) =>
              onChange({ visibility: event.target.value as Memory["visibility"] })
            }
          >
            <option value="shareable">Shareable</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label>
          Priority
          <select
            value={seed.priority}
            onChange={(event) =>
              onChange({ priority: event.target.value as ConversationSeedPriority })
            }
          >
            {conversationSeedPriorities.map((item) => (
              <option key={item} value={item}>
                {titleCase(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tone
          <select
            value={seed.tone ?? "curious"}
            onChange={(event) =>
              onChange({ tone: event.target.value as ConversationSeedTone })
            }
          >
            {conversationSeedTones.map((item) => (
              <option key={item} value={item}>
                {titleCase(item)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button danger-icon"
          type="button"
          aria-label="Remove seed draft"
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="seed-detail-grid">
        <label>
          Title
          <input
            value={seed.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label>
          Source URL
          <input
            value={seed.sourceUrl ?? ""}
            onChange={(event) => onChange({ sourceUrl: optional(event.target.value) })}
          />
        </label>
        <label className="span-2">
          Summary
          <textarea
            value={seed.summary}
            onChange={(event) => onChange({ summary: event.target.value })}
          />
        </label>
        <label>
          Suggested angle
          <textarea
            value={seed.suggestedAngle ?? ""}
            onChange={(event) =>
              onChange({ suggestedAngle: optional(event.target.value) })
            }
          />
        </label>
        <label>
          Talking points
          <textarea
            value={seed.talkingPoints.join("\n")}
            onChange={(event) => onChange({ talkingPoints: splitLines(event.target.value) })}
          />
        </label>
      </div>
    </article>
  );
}

function ConversationSeedRow({
  seed,
  archiving,
  onArchive,
}: {
  seed: ConversationSeed;
  archiving: boolean;
  onArchive: () => void;
}) {
  return (
    <article className={`conversation-seed-row priority-${seed.priority}`}>
      <div>
        <div className="seed-row-header">
          <strong>{seed.title}</strong>
          <span className="pill">{titleCase(seed.priority)}</span>
        </div>
        <p>{seed.summary}</p>
        {seed.suggestedAngle && <small>{seed.suggestedAngle}</small>}
        <div className="seed-meta">
          <span>{titleCase(seed.source)}</span>
          <span>{titleCase(seed.visibility)}</span>
          {seed.tone && <span>{titleCase(seed.tone)}</span>}
          <span>{seed.friendMirrorName ?? "All active friends"}</span>
          {seed.expiresAt && <span>Expires {shortDate(seed.expiresAt)}</span>}
        </div>
      </div>
      <button
        className="icon-button danger-icon"
        type="button"
        aria-label="Archive conversation seed"
        disabled={archiving}
        onClick={onArchive}
      >
        {archiving ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
      </button>
    </article>
  );
}

function FriendsView() {
  const friends = useQuery(api.friends.listMyFriends, {});
  const goals = useQuery(api.friends.listFriendGoals, {});
  const createInvite = useMutation(api.friends.createFriendInvite);
  const acceptInvite = useMutation(api.friends.acceptFriendInvite);
  const createGoal = useMutation(api.friends.createFriendGoal);
  const updateGoal = useMutation(api.friends.updateFriendGoal);
  const updateGoalStatus = useMutation(api.friends.updateFriendGoalStatus);
  const removeFriendship = useMutation(api.friends.removeFriendship);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [incomingCode, setIncomingCode] = useState("");
  const [goalFriendshipId, setGoalFriendshipId] = useState<Id>("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalBusyId, setGoalBusyId] = useState<Id | null>(null);
  const [removingId, setRemovingId] = useState<Id | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeFriends = useMemo(
    () => friends?.filter((friend) => friend.friendship.status === "active") ?? [],
    [friends],
  );

  useEffect(() => {
    const firstActiveId = activeFriends[0]?.friendship._id ?? "";
    const selectedStillActive = activeFriends.some(
      (friend) => friend.friendship._id === goalFriendshipId,
    );
    if (!goalFriendshipId || !selectedStillActive) {
      setGoalFriendshipId(firstActiveId);
    }
  }, [activeFriends, goalFriendshipId]);

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await createInvite({});
      setInviteCode(result.inviteCode);
      await navigator.clipboard?.writeText(result.inviteCode);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function accept(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await acceptInvite({ inviteCode: incomingCode });
      setMessage(result.alreadyFriends ? "Already connected." : "Friendship is active.");
      setIncomingCode("");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(friend: FriendSummary) {
    const name = friend.friendMirror?.name ?? friend.friendUser?.name ?? "this friend";
    if (!window.confirm(`Remove ${name} from your connections?`)) return;
    setRemovingId(friend.friendship._id);
    setMessage(null);
    try {
      await removeFriendship({ friendshipId: friend.friendship._id });
      setMessage(`${name} removed.`);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  async function proposeGoal(event: FormEvent) {
    event.preventDefault();
    const title = goalTitle.trim();
    if (!title || !goalFriendshipId) return;
    setGoalBusy(true);
    setMessage(null);
    try {
      await createGoal({
        friendshipId: goalFriendshipId,
        title,
        description: optional(goalDescription),
      });
      setGoalTitle("");
      setGoalDescription("");
      setMessage("Goal proposed.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setGoalBusy(false);
    }
  }

  async function changeGoalStatus(goal: FriendGoalSummary, status: FriendGoalStatus) {
    setGoalBusyId(goal.goal._id);
    setMessage(null);
    try {
      await updateGoalStatus({ goalId: goal.goal._id, status });
      setMessage("Goal updated.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setGoalBusyId(null);
    }
  }

  async function saveGoal(goal: FriendGoalSummary, title: string, description: string) {
    setGoalBusyId(goal.goal._id);
    setMessage(null);
    try {
      await updateGoal({
        goalId: goal.goal._id,
        title,
        description: optional(description),
      });
      setMessage("Goal re-proposed.");
    } catch (err) {
      setMessage(errorMessage(err));
      throw err;
    } finally {
      setGoalBusyId(null);
    }
  }

  return (
    <div className="view-grid friends-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Friends</p>
          <h2>Connect two Mirrors</h2>
          <p>Active friendships are picked up by the schedule in Settings.</p>
        </div>
        <button className="primary-action" type="button" disabled={busy} onClick={create}>
          {busy ? <Loader2 className="spin" size={18} /> : <UserRoundPlus size={18} />}
          Invite
        </button>
      </section>

      <section className="invite-panel">
        <SectionTitle icon={Copy} title="Invite code" />
        <div className="invite-code">{inviteCode ?? "Create one"}</div>
        <form className="inline-form" onSubmit={accept}>
          <input
            aria-label="Invite code"
            placeholder="Paste code"
            value={incomingCode}
            onChange={(event) => setIncomingCode(event.target.value.toUpperCase())}
          />
          <button className="secondary-action" type="submit" disabled={busy || !incomingCode.trim()}>
            <Check size={18} />
            Accept
          </button>
        </form>
        {message && <p className="inline-note">{message}</p>}
      </section>

      <section className="friend-list">
        <SectionTitle icon={UsersRound} title="Connections" />
        {friends === undefined && <SkeletonRows count={4} />}
        {friends?.length === 0 && (
          <EmptyState title="No friends connected" text="Create an invite or accept one from a friend." />
        )}
        {friends?.map((friend) => (
          <FriendRow
            key={friend.friendship._id}
            friend={friend}
            removing={removingId === friend.friendship._id}
            onRemove={() => remove(friend)}
          />
        ))}
      </section>

      <section className="friend-goals-panel">
        <SectionTitle icon={Target} title="Shared goals" />
        <form className="goal-composer" onSubmit={proposeGoal}>
          <label>
            Friend
            <select
              disabled={goalBusy || activeFriends.length === 0}
              value={goalFriendshipId}
              onChange={(event) => setGoalFriendshipId(event.target.value)}
            >
              {activeFriends.length === 0 && <option value="">No active friends</option>}
              {activeFriends.map((friend) => (
                <option key={friend.friendship._id} value={friend.friendship._id}>
                  {friend.friendMirror?.name ?? friend.friendUser?.name ?? "Friend"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal
            <input
              required
              placeholder="Plan a weekend catch-up"
              value={goalTitle}
              onChange={(event) => setGoalTitle(event.target.value)}
            />
          </label>
          <label className="span-2">
            Details
            <textarea
              placeholder="Optional context, timing, or what would make it done"
              value={goalDescription}
              onChange={(event) => setGoalDescription(event.target.value)}
            />
          </label>
          <button
            className="primary-action"
            type="submit"
            disabled={goalBusy || !goalTitle.trim() || !goalFriendshipId}
          >
            {goalBusy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            Propose goal
          </button>
        </form>

        {goals === undefined && <SkeletonRows count={4} />}
        {goals?.length === 0 && (
          <EmptyState title="No shared goals" text="Propose a goal, then your friend can agree or reject it." />
        )}
        <div className="goal-list">
          {goals?.map((goal) => (
            <FriendGoalRow
              key={goal.goal._id}
              goal={goal}
              busy={goalBusyId === goal.goal._id}
              onSave={(title, description) => saveGoal(goal, title, description)}
              onStatus={(status) => changeGoalStatus(goal, status)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function AskView() {
  const messages = useQuery(api.conversations.listAssistantMessages, { limit: 50 });
  const ask = useAction(api.conversations.askMyMirror);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [localMessages, setLocalMessages] = useState<AssistantMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (messages) setLocalMessages(messages);
  }, [messages]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    setDraft("");
    setBusy(true);
    setError(null);
    const now = Date.now();
    setLocalMessages((prior) => [
      ...prior,
      {
        _id: `local-${now}`,
        userId: "local",
        mirrorId: "local",
        role: "user",
        content: question,
        createdAt: now,
      },
    ]);
    try {
      const result = await ask({ question });
      setLocalMessages((prior) => [
        ...prior,
        {
          _id: `local-answer-${Date.now()}`,
          userId: "local",
          mirrorId: "local",
          role: "mirror",
          content: result.answer,
          createdAt: Date.now(),
        },
      ]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-layout">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Ask My Mirror</p>
          <h2>Private chat with your own agent</h2>
          <p>Private memories can be used here. Friend conversations only receive shareable context.</p>
        </div>
      </section>
      <section className="assistant-chat">
        {messages === undefined && <SkeletonRows count={5} />}
        {localMessages.length === 0 && (
          <EmptyState title="No private chat yet" text="Ask what your Mirror knows, remembers, or should prepare for." />
        )}
        <div className="message-stack">
          {localMessages.map((message) => (
            <AssistantBubble key={message._id} message={message} />
          ))}
        </div>
      </section>
      <form className="ask-composer" onSubmit={submit}>
        <input
          aria-label="Question"
          placeholder="Ask your Mirror"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="primary-icon-action" type="submit" disabled={busy || !draft.trim()}>
          {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          <span>Send</span>
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function SettingsView({ user }: { user: User }) {
  const usage = useQuery(api.settings.getAiUsageEstimate, {});
  const schedule = useQuery(api.settings.getAgentSchedule, {});
  const setPaused = useMutation(api.settings.setMirrorPaused);
  const { signOut } = useAuthActions();
  const [busy, setBusy] = useState(false);

  async function togglePaused() {
    setBusy(true);
    try {
      await setPaused({ paused: !user.mirrorPaused });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-grid settings-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Budget and safety controls</h2>
          <p>Usage is logged server-side after each model call.</p>
        </div>
      </section>

      <section className="settings-panel">
        <SectionTitle icon={CirclePause} title="Mirror activity" />
        <div className="setting-row">
          <div>
            <strong>{user.mirrorPaused ? "Paused" : "Active"}</strong>
            <span>Pause stops all Mirror activity for this account.</span>
          </div>
          <button className="secondary-action" type="button" disabled={busy} onClick={togglePaused}>
            {busy ? <Loader2 className="spin" size={18} /> : <CirclePause size={18} />}
            {user.mirrorPaused ? "Resume" : "Pause"}
          </button>
        </div>
      </section>

      <AgentSchedulePanel schedule={schedule} isAdmin={user.role === "admin"} />

      <UsagePanel usage={usage} />

      {user.role === "admin" && <AdminAccessPanel />}

      <section className="settings-panel">
        <SectionTitle icon={DoorOpen} title="Session" />
        <button className="ghost-button" type="button" onClick={() => signOut()}>
          <DoorOpen size={17} />
          Sign out
        </button>
      </section>
    </div>
  );
}

function AgentSchedulePanel({
  schedule,
  isAdmin,
}: {
  schedule: AgentSchedule | undefined;
  isAdmin: boolean;
}) {
  const updateSchedule = useMutation(api.settings.updateAgentSchedule);
  const scheduleTimes = schedule?.times.join(", ") ?? "";
  const [enabled, setEnabled] = useState(true);
  const [timezone, setTimezone] = useState("Etc/UTC");
  const [timesDraft, setTimesDraft] = useState("09:00, 12:00, 15:00, 18:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!schedule) return;
    setEnabled(schedule.enabled);
    setTimezone(schedule.timezone);
    setTimesDraft(schedule.times.join(", "));
  }, [schedule?.enabled, schedule?.timezone, scheduleTimes]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateSchedule({
        enabled,
        timezone,
        times: splitScheduleTimes(timesDraft),
      });
      setMessage("Schedule saved.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel schedule-panel">
      <SectionTitle icon={Clock} title="Agent schedule" />
      {schedule === undefined ? (
        <SkeletonRows count={3} />
      ) : (
        <>
          <form className="schedule-form" onSubmit={submit}>
            <label>
              Status
              <select
                disabled={!isAdmin}
                value={enabled ? "enabled" : "disabled"}
                onChange={(event) => setEnabled(event.target.value === "enabled")}
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              Timezone
              <input
                disabled={!isAdmin}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Etc/UTC"
              />
            </label>
            <label>
              Times
              <input
                disabled={!isAdmin}
                value={timesDraft}
                onChange={(event) => setTimesDraft(event.target.value)}
                placeholder="09:00, 12:00, 15:00, 18:00"
              />
            </label>
            {isAdmin && (
              <button className="primary-action" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <Clock size={18} />}
                Save
              </button>
            )}
          </form>
          <div className="schedule-meta">
            <div>
              <span>Chats per day</span>
              <strong>{schedule.maxChatsPerDay} windows</strong>
            </div>
            <div>
              <span>Messages per chat</span>
              <strong>{schedule.messagesPerChat} messages</strong>
            </div>
            <div>
              <span>Check interval</span>
              <strong>{schedule.schedulerIntervalMinutes} minutes</strong>
            </div>
          </div>
          <div className="schedule-chip-row" aria-label="Configured communication times">
            {schedule.times.map((time) => (
              <span key={time} className="schedule-chip">
                {time}
              </span>
            ))}
          </div>
          {message && <p className="inline-note">{message}</p>}
        </>
      )}
    </section>
  );
}

function AdminAccessPanel() {
  const invites = useQuery(api.access.listPortalInvites, {});
  const createInvite = useMutation(api.access.createPortalInvite);
  const revokeInvite = useMutation(api.access.revokePortalInvite);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await createInvite({
        email: optional(email),
        role,
      });
      setLastInviteUrl(result.inviteUrl);
      await navigator.clipboard?.writeText(result.inviteUrl);
      setEmail("");
      setRole("user");
      setMessage("Invite link copied.");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel admin-panel">
      <SectionTitle icon={UserRoundPlus} title="Portal invites" />
      <form className="admin-invite-form" onSubmit={submit}>
        <label>
          Email
          <input
            inputMode="email"
            type="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "user")}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="primary-action" type="submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <UserRoundPlus size={18} />}
          Create link
        </button>
      </form>
      {lastInviteUrl && (
        <div className="invite-link-box">
          <span>{lastInviteUrl}</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Copy invite link"
            onClick={() => navigator.clipboard?.writeText(lastInviteUrl)}
          >
            <Copy size={16} />
          </button>
        </div>
      )}
      {message && <p className="inline-note">{message}</p>}
      <div className="admin-invite-list">
        {invites === undefined && <SkeletonRows count={3} />}
        {invites?.length === 0 && (
          <EmptyState title="No portal invites" text="Create a link to let someone join." />
        )}
        {invites?.map((invite) => (
          <AccessInviteRow
            key={invite._id}
            invite={invite}
            onRevoke={() => revokeInvite({ inviteId: invite._id })}
          />
        ))}
      </div>
    </section>
  );
}

function AccessInviteRow({
  invite,
  onRevoke,
}: {
  invite: AccessInvite;
  onRevoke: () => void;
}) {
  const status = invite.revokedAt
    ? "revoked"
    : invite.claimedAt
      ? "claimed"
      : invite.expiresAt && invite.expiresAt < Date.now()
        ? "expired"
        : "open";
  return (
    <article className="access-invite-row">
      <div>
        <strong>{invite.email ?? "Any email"}</strong>
        <small>{invite.inviteCode} · {invite.role} · {status}</small>
      </div>
      <button
        className="icon-button"
        type="button"
        disabled={status !== "open"}
        aria-label="Revoke invite"
        onClick={onRevoke}
      >
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function UsagePanel({ usage }: { usage: UsageEstimate | undefined }) {
  return (
    <section className="settings-panel">
      <SectionTitle icon={Activity} title="AI usage" />
      {usage === undefined ? (
        <SkeletonRows count={3} />
      ) : (
        <>
          <div className="usage-grid">
            <Metric label="Calls" value={usage.calls} />
            <Metric label="Input tokens" value={compactNumber(usage.inputTokens)} />
            <Metric label="Output tokens" value={compactNumber(usage.outputTokens)} />
            <Metric label="USD" value={`$${usage.estimatedCostUsd.toFixed(2)}`} />
          </div>
          <div className="purpose-list">
            {Object.entries(usage.byPurpose).map(([purpose, count]) => (
              <div key={purpose}>
                <span>{purpose.replaceAll("_", " ")}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function NotificationBadge({ count }: { count: number }) {
  return (
    <div className="notification-badge" aria-label={`${count} unread notifications`}>
      <Bell size={18} />
      <span>{count}</span>
    </div>
  );
}

function ConversationButton({
  conversation,
  active,
  onSelect,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={active ? "conversation-button active" : "conversation-button"}
      type="button"
      onClick={onSelect}
    >
      <span className="avatar">{conversation.friendMirrorEmoji ?? "MF"}</span>
      <span>
        <strong>{conversation.friendMirrorName}</strong>
        <small>{conversation.conversation.summary ?? titleCase(conversation.conversation.status)}</small>
      </span>
      <time>{shortDate(conversation.conversation.createdAt)}</time>
    </button>
  );
}

function MirrorBubble({
  message,
  ownMirrorId,
}: {
  message: MirrorMessage;
  ownMirrorId: Id;
}) {
  const own = message.senderMirrorId === ownMirrorId;
  return (
    <article className={own ? "chat-bubble own" : "chat-bubble"}>
      <p><MessageContent text={message.content} /></p>
      <time>{shortTime(message.createdAt)}</time>
    </article>
  );
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  return (
    <article className={message.role === "user" ? "chat-bubble own" : "chat-bubble"}>
      <p><MessageContent text={message.content} /></p>
      <time>{shortTime(message.createdAt)}</time>
    </article>
  );
}

function MessageContent({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, lineIndex) => (
        <Fragment key={`${lineIndex}-${line}`}>
          {lineIndex > 0 && <br />}
          {line.split(/(https?:\/\/[^\s]+)/g).map((part, partIndex) =>
            part.startsWith("http") ? (
              <a
                key={`${lineIndex}-${partIndex}`}
                className="message-link"
                href={part}
                target="_blank"
                rel="noreferrer"
              >
                {part}
              </a>
            ) : (
              <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

function MemoryColumn({
  title,
  memories,
  loading,
  onArchive,
}: {
  title: string;
  memories: Memory[];
  loading: boolean;
  onArchive: (memoryId: Id) => void;
}) {
  return (
    <section className="memory-column">
      <SectionTitle icon={NotebookTabs} title={title} />
      {loading && <SkeletonRows count={4} />}
      {!loading && memories.length === 0 && (
        <EmptyState title={`No ${title.toLowerCase()} memory`} text="Add one from the composer." />
      )}
      {memories.map((memory) => (
        <article key={memory._id} className="memory-item">
          <div>
            <span className="pill">{titleCase(memory.type)}</span>
            <p>{memory.content}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Archive memory"
            onClick={() => onArchive(memory._id)}
          >
            <Trash2 size={16} />
          </button>
        </article>
      ))}
    </section>
  );
}

function FriendRow({
  friend,
  removing,
  onRemove,
}: {
  friend: FriendSummary;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <article className="friend-row">
      <span className="avatar">{friend.friendMirror?.avatarEmoji ?? "MF"}</span>
      <div>
        <strong>{friend.friendMirror?.name ?? "Friend's Mirror"}</strong>
        <small>{friend.friendUser?.name ?? "Friend"} · {titleCase(friend.friendship.status)}</small>
      </div>
      <time>{friend.friendship.lastConversationAt ? shortDate(friend.friendship.lastConversationAt) : "New"}</time>
      <button
        className="icon-button danger-icon"
        type="button"
        aria-label={`Remove ${friend.friendMirror?.name ?? "friend"}`}
        disabled={removing}
        onClick={onRemove}
      >
        {removing ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
      </button>
    </article>
  );
}

function FriendGoalRow({
  goal,
  busy,
  onSave,
  onStatus,
}: {
  goal: FriendGoalSummary;
  busy: boolean;
  onSave: (title: string, description: string) => Promise<void>;
  onStatus: (status: FriendGoalStatus) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.goal.title);
  const [description, setDescription] = useState(goal.goal.description ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const status = goal.goal.status;
  const canRespond = status === "proposed" && goal.needsResponseFromCurrentUser;
  const waitingForFriend = status === "proposed" && !goal.needsResponseFromCurrentUser;

  useEffect(() => {
    if (editing) return;
    setTitle(goal.goal.title);
    setDescription(goal.goal.description ?? "");
  }, [editing, goal.goal.description, goal.goal.title]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setLocalError(null);
    try {
      await onSave(nextTitle, description);
      setEditing(false);
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  return (
    <article className={`friend-goal-row status-${status}`}>
      <div className="goal-row-header">
        <span className="avatar">{goal.friendMirrorEmoji ?? "MF"}</span>
        <div>
          <strong>{goal.goal.title}</strong>
          <small>
            {goal.friendMirrorName} · {goal.createdByCurrentUser ? "Proposed by you" : "Proposed by friend"}
          </small>
        </div>
        <span className="goal-status">{goalStatusLabel(goal)}</span>
      </div>

      {goal.goal.description && !editing && <p>{goal.goal.description}</p>}

      {editing ? (
        <form className="goal-edit-form" onSubmit={submit}>
          <label>
            Goal
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Details
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {localError && <p className="form-error">{localError}</p>}
          <div className="goal-actions">
            <button className="primary-action" type="submit" disabled={busy || !title.trim()}>
              {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              Save update
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setTitle(goal.goal.title);
                setDescription(goal.goal.description ?? "");
              }}
            >
              <X size={18} />
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="goal-actions">
          {canRespond && (
            <>
              <button className="secondary-action" type="button" disabled={busy} onClick={() => onStatus("agreed")}>
                {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                Agree
              </button>
              <button className="ghost-button danger-action" type="button" disabled={busy} onClick={() => onStatus("declined")}>
                <X size={18} />
                Reject
              </button>
            </>
          )}
          {waitingForFriend && <span className="goal-muted">Waiting for friend</span>}
          {status === "agreed" && (
            <button className="secondary-action" type="button" disabled={busy} onClick={() => onStatus("in_progress")}>
              {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              Start
            </button>
          )}
          {status === "in_progress" && (
            <button className="secondary-action" type="button" disabled={busy} onClick={() => onStatus("done")}>
              {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              Complete
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            title="Edit goal"
            aria-label={`Edit ${goal.goal.title}`}
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
        </div>
      )}
    </article>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Activity; title: string }) {
  return (
    <div className="section-title">
      <Icon size={18} />
      <h3>{title}</h3>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RuleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rule-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="skeleton-row" />
      ))}
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-screen">
      <Loader2 className="spin" size={24} />
      <span>{label}</span>
    </main>
  );
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitScheduleTimes(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function expiryFromChoice(value: string) {
  if (value === "none") return undefined;
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function goalStatusLabel(goal: FriendGoalSummary) {
  if (goal.goal.status === "proposed") {
    return goal.needsResponseFromCurrentUser ? "Needs your response" : "Awaiting response";
  }
  return titleCase(goal.goal.status);
}

function shortDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function shortTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

const friendlyErrorByCode: Record<string, string> = {
  DAILY_CAP_REACHED:
    "This Mirror pair already used that scheduled chat window. Try the next window, or use Simulate next chat for an on-demand preview.",
  UNAUTHENTICATED: "Please sign in again to continue.",
  FORBIDDEN: "You do not have access to do that.",
  NO_MIRROR: "Finish onboarding to create your Mirror first.",
  INACTIVE: "This friendship is not active right now.",
  PAUSED: "Your Mirror is paused. Resume it in Settings to use this.",
  NOT_FOUND: "That item is no longer available.",
  BLOCKED: "This friendship is blocked.",
  INVALID_CODE: "That invite code was not found.",
  EXPIRED: "This invite has expired.",
  SELF_INVITE: "You cannot accept your own invite.",
  INVALID_GOAL: "Add a goal title before saving.",
  INVALID_SEED: "Add a seed title and summary before saving.",
  INVALID_TRANSITION: "That goal cannot move to that state right now.",
  TOO_SHORT: "Paste a longer source so there is enough signal to learn from.",
  INVALID: "Check the form and try again.",
};

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < value.length; i++) {
    const char = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, i + 1);
    }
  }
  return null;
}

function parseErrorPayload(value: unknown): { code?: string; message?: string } | null {
  if (!value) return null;
  if (typeof value === "object") {
    const record = value as { code?: unknown; message?: unknown; data?: unknown };
    const dataPayload = parseErrorPayload(record.data);
    if (dataPayload?.code || dataPayload?.message) return dataPayload;
    const messagePayload = parseErrorPayload(record.message);
    if (messagePayload?.code || messagePayload?.message) return messagePayload;
    if (typeof record.code === "string") {
      return {
        code: record.code,
        message: typeof record.message === "string" ? record.message : undefined,
      };
    }
    if (typeof record.message === "string") {
      return { message: record.message };
    }
  }
  if (typeof value !== "string") return null;
  const json = extractJsonObject(value);
  if (!json) return null;
  try {
    return parseErrorPayload(JSON.parse(json));
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  const payload = parseErrorPayload(error) ?? parseErrorPayload((error as Error)?.message);
  if (payload?.code && friendlyErrorByCode[payload.code]) {
    return friendlyErrorByCode[payload.code];
  }
  if (payload?.message) return payload.message;
  if (error instanceof Error) {
    const cleaned = error.message
      .replace(/^\[CONVEX[^\]]+\]\s*/i, "")
      .replace(/^Server Error\s*/i, "")
      .replace(/^Uncaught ConvexError:\s*/i, "")
      .trim();
    if (cleaned && !cleaned.includes("Request ID") && !cleaned.includes("../convex/")) {
      return cleaned;
    }
  }
  return "Something went wrong.";
}
