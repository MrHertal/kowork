import type {
  Message as OpenCodeMessage,
  UserMessage,
} from "@opencode-ai/sdk/v2/client";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { StickToBottomContext } from "use-stick-to-bottom";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { PromptAttachButton } from "@/components/prompt-input/attach-button";
import {
  useGlobalAttachmentDrop,
  usePromptAttachments,
} from "@/components/prompt-input/attachments";
import { buildRequestParts } from "@/components/prompt-input/build-request-parts";
import { PromptDragOverlay } from "@/components/prompt-input/drag-overlay";
import { PromptImageAttachments } from "@/components/prompt-input/image-attachments";
import { ComposerTray } from "@/components/session/composer-tray";
import { FolderPicker } from "@/components/session/folder-picker";
import { MessageTimeline } from "@/components/session/message-timeline";
import { ModelPicker } from "@/components/session/model-picker";
import { NewSessionView } from "@/components/session/new-session-view";
import {
  PermissionModeSelector,
  type PermissionMode,
} from "@/components/session/permission-mode-selector";
import { useChildData } from "@/contexts/global-sync";
import { useLocal } from "@/contexts/local";
import { usePermission } from "@/contexts/permission";
import { usePrompt, type ImageAttachmentPart } from "@/contexts/prompt";
import { useSDK } from "@/contexts/sdk";
import { useSync } from "@/contexts/sync";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
  SessionComposerRegion,
  useSessionComposerState,
} from "@/pages/session/composer";
import {
  resetSessionModel,
  syncSessionModel,
} from "@/pages/session/session-model-helpers";
import { ascending } from "@/utils/id";
import { formatServerError, translate } from "@/utils/server-errors";
import { SESSION_DIRECTORY_MODE_METADATA_KEY } from "@/utils/session-directory";
import {
  applyPermissionMode,
  defaultPermissionMode,
  getPermissionMode,
} from "@/utils/permission-mode";

const emptyMessages: OpenCodeMessage[] = [];

export function Page({
  sessionId,
  attachedDirectory,
  defaultDirectory,
  folderAttached,
  onDirectoryChange,
  onDirectoryDetach,
}: {
  sessionId?: string;
  attachedDirectory?: string;
  defaultDirectory?: string;
  folderAttached?: boolean;
  onDirectoryChange?: (directory: string) => void;
  onDirectoryDetach?: () => void;
}) {
  const sdk = useSDK();
  const sync = useSync();
  const local = useLocal();
  const permission = usePermission();
  const prompt = usePrompt();
  const { handlePaste: handlePromptPaste } = usePromptAttachments();
  const { isDragging } = useGlobalAttachmentDrop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const conversationRef = useRef<StickToBottomContext>(null);
  const directory = sdk.directory;

  const [text, setText] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [newSessionPermissionMode, setNewSessionPermissionMode] =
    useState<PermissionMode>(defaultPermissionMode);
  const [sessionPermissionMode, setSessionPermissionMode] =
    useState<PermissionMode>(defaultPermissionMode);

  useEffect(() => {
    if (!sessionId || !permission.ready) return;
    setSessionPermissionMode(
      getPermissionMode(permission.isAutoAccepting(sessionId, directory)),
    );
  }, [sessionId, directory, permission]);
  const sendingRef = useRef(false);
  const blockedRef = useRef(false);

  const sessionMessages = useChildData(directory, (s) =>
    sessionId ? (s.message[sessionId] ?? emptyMessages) : emptyMessages,
  );
  const messagesReady = useChildData(directory, (s) =>
    sessionId ? s.message[sessionId] !== undefined : true,
  );
  const sessionStatus = useChildData(directory, (s) =>
    sessionId ? s.session_status[sessionId] : undefined,
  );
  const composerState = useSessionComposerState({
    sessionID: sessionId,
    directory,
  });
  const blocked = composerState.blocked;
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  const isChildSession = useChildData(directory, (s) => {
    if (!sessionId) return false;
    return !!s.session.find((item) => item.id === sessionId)?.parentID;
  });

  const isBusy =
    !!sessionStatus && sessionStatus.type !== "idle" && !!sessionId;
  const status = isBusy ? "streaming" : "ready";

  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  const sessionSyncedAt = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!sessionId) return;
    const now = Date.now();
    const last = sessionSyncedAt.current.get(sessionId);
    const stale = last !== undefined && now - last > 15_000;
    sessionSyncedAt.current.set(sessionId, now);
    sync.session.sync(
      sessionId,
      stale && !isBusyRef.current ? { force: true } : undefined,
    );
  }, [sessionId, sync.session]);

  const userMessages = useMemo(
    () =>
      sessionMessages.filter((msg): msg is UserMessage => msg.role === "user"),
    [sessionMessages],
  );

  const lastUserMessage = useMemo(() => userMessages.at(-1), [userMessages]);

  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;
    if (prev && !sessionId) {
      resetSessionModel(local);
    }
  }, [sessionId, local]);

  useEffect(() => {
    if (!lastUserMessage) return;
    syncSessionModel(local, lastUserMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUserMessage?.id]);

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const input = message.text?.trim();
      if (!input || sendingRef.current || blockedRef.current || isChildSession)
        return;

      const currentModelVal = local.model.current;
      const currentAgentVal = local.agent.current;
      const variant = local.model.variant.current;
      if (!currentModelVal || !currentAgentVal) {
        toast.error(m.session_model_required_title(), {
          description: m.session_model_required_description(),
        });
        return;
      }

      sendingRef.current = true;
      setSending(true);

      let sid = sessionId;
      let isNewSession = false;
      let messageID: string | undefined;
      const promptSnapshot = prompt.current;

      try {
        if (!sid) {
          const result = await sdk.client.session.create({
            metadata: {
              [SESSION_DIRECTORY_MODE_METADATA_KEY]: attachedDirectory
                ? "attached"
                : "default",
            },
          });
          const session = result.data;
          if (!session) throw new Error(m.session_error_create_failed());
          sid = session.id;
          queryClient.setQueryData(["session", sid], session);
          applyPermissionMode(
            permission,
            newSessionPermissionMode,
            sid,
            directory,
          );
          isNewSession = true;
        }

        messageID = ascending("message");
        const images = promptSnapshot.filter(
          (part): part is ImageAttachmentPart => part.type === "image",
        );
        const { requestParts, optimisticParts } = buildRequestParts({
          text: input,
          images,
          messageID,
          sessionID: sid,
        });

        sync.session.addOptimisticMessage({
          sessionID: sid,
          messageID,
          parts: optimisticParts,
          agent: currentAgentVal.name,
          model: {
            modelID: currentModelVal.id,
            providerID: currentModelVal.provider.id,
          },
          variant,
        });

        setText("");
        prompt.reset();
        conversationRef.current?.scrollToBottom("smooth");

        await sdk.client.session.promptAsync({
          sessionID: sid,
          messageID,
          agent: currentAgentVal.name,
          model: {
            modelID: currentModelVal.id,
            providerID: currentModelVal.provider.id,
          },
          variant,
          parts: requestParts,
        });

        if (isNewSession) {
          local.session.promote(sid);
          navigate({ to: "/session/$id", params: { id: sid } });
        }
      } catch (error) {
        toast.error(m.common_requestFailed(), {
          description: formatServerError(error, translate),
        });
        setText((prev) => prev || input);
        prompt.set(promptSnapshot, prompt.cursor);
        if (sid && messageID) {
          sync.session.rollbackOptimisticMessage({
            sessionID: sid,
            messageID,
          });
        }
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [
      sessionId,
      sdk.client,
      sync.session,
      local,
      navigate,
      queryClient,
      isChildSession,
      prompt,
      attachedDirectory,
      directory,
      newSessionPermissionMode,
      permission,
    ],
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
    },
    [],
  );

  const handleStop = useCallback(() => {
    if (!sessionId) return;
    sdk.client.session.abort({ sessionID: sessionId }).catch(() => {});
  }, [sessionId, sdk.client]);

  const isSubmitDisabled =
    status === "streaming" ? false : !text.trim() || sending || isChildSession;

  const handleSessionPermissionModeChange = (mode: PermissionMode) => {
    if (!sessionId) return;
    setSessionPermissionMode(mode);
    applyPermissionMode(permission, mode, sessionId, directory);
  };

  const showComposerTray =
    !sessionId &&
    !!defaultDirectory &&
    !!onDirectoryChange &&
    !!onDirectoryDetach;

  const promptComposer = (
    <SessionComposerRegion state={composerState}>
      <div className="relative">
        <PromptInput
          onSubmit={handleSubmit}
          className={cn(
            showComposerTray && "relative z-10 rounded-3xl bg-background",
          )}
        >
          <PromptInputBody>
            <PromptImageAttachments />
            <PromptInputTextarea
              onChange={handleTextChange}
              onPaste={handlePromptPaste}
              value={text}
              placeholder={m.session_prompt_placeholder()}
              className="p-4"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptAttachButton />
              {sessionId && (
                <PermissionModeSelector
                  value={sessionPermissionMode}
                  onValueChange={handleSessionPermissionModeChange}
                  disabled={!permission.ready}
                />
              )}
            </PromptInputTools>
            <PromptInputTools className="justify-end">
              {sessionId && folderAttached && (
                <FolderPicker directory={directory} />
              )}
              <ModelPicker model={local.model} />
              <PromptInputSubmit
                disabled={isSubmitDisabled}
                status={status}
                onStop={handleStop}
              />
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
        {showComposerTray &&
          defaultDirectory &&
          onDirectoryChange &&
          onDirectoryDetach && (
            <ComposerTray
              attachedDirectory={attachedDirectory}
              defaultDirectory={defaultDirectory}
              disabled={sending || !permission.ready}
              permissionMode={newSessionPermissionMode}
              onPermissionModeChange={setNewSessionPermissionMode}
              onDirectoryChange={onDirectoryChange}
              onDirectoryDetach={onDirectoryDetach}
            />
          )}
        <PromptDragOverlay isDragging={isDragging} />
      </div>
    </SessionComposerRegion>
  );

  if (!sessionId) {
    return (
      <div className="relative flex size-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-8">
            <div className="flex w-full max-w-2xl flex-col gap-6">
              <NewSessionView />
              {promptComposer}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex size-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        {messagesReady ? (
          <MessageTimeline sessionID={sessionId} contextRef={conversationRef} />
        ) : null}
      </div>
      <div className="mx-auto w-full max-w-4xl shrink-0">
        <div className="w-full px-4 pb-4">{promptComposer}</div>
      </div>
    </div>
  );
}
