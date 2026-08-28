// @opencode-ref: opencode/packages/app/src/pages/session/composer/session-composer-state.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useChildData } from "@/contexts/global-sync";
import { usePermission } from "@/contexts/permission";
import { useSDK } from "@/contexts/sdk";
import { m } from "@/paraglide/messages";

import {
  sessionPermissionRequest,
  sessionQuestionRequest,
} from "./session-request-tree";

export interface SessionComposerStateInput {
  sessionID: string | undefined;
  directory: string;
}

export function useSessionComposerState(input: SessionComposerStateInput) {
  const sdk = useSDK();
  const { autoResponds } = usePermission();
  const [responding, setResponding] = useState<string | undefined>(undefined);
  const respondingRef = useRef<string | undefined>(undefined);

  // Compare by id: requests are immutable per id on the server — they're
  // added or removed, never mutated in place.
  const permissionRequest = useChildData(
    input.directory,
    (s) =>
      sessionPermissionRequest(
        s.session,
        s.permission,
        input.sessionID,
        (item) => !autoResponds(item, input.directory),
      ),
    (a, b) => a?.id === b?.id,
  );

  const questionRequest = useChildData(
    input.directory,
    (s) => sessionQuestionRequest(s.session, s.question, input.sessionID),
    (a, b) => a?.id === b?.id,
  );

  const blocked = !input.sessionID
    ? false
    : !!permissionRequest || !!questionRequest;
  const permissionResponding =
    !!permissionRequest && responding === permissionRequest.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state and its guard ref reset together (refs can't be written during render)
    setResponding(undefined);
    respondingRef.current = undefined;
  }, [input.sessionID]);

  const decide = useCallback(
    (response: "once" | "always" | "reject") => {
      const request = permissionRequest;
      if (!request) return;
      if (respondingRef.current === request.id) return;

      respondingRef.current = request.id;
      setResponding(request.id);

      sdk.client.permission
        .reply({
          requestID: request.id,
          reply: response,
        })
        .catch((err: unknown) => {
          const description = err instanceof Error ? err.message : String(err);
          toast.error(m.common_requestFailed(), { description });
        })
        .finally(() => {
          setResponding((current) =>
            current === request.id ? undefined : current,
          );
          if (respondingRef.current === request.id) {
            respondingRef.current = undefined;
          }
        });
    },
    [sdk.client.permission, permissionRequest],
  );

  return useMemo(
    () => ({
      blocked,
      permissionRequest,
      questionRequest,
      permissionResponding,
      decide,
    }),
    [blocked, permissionRequest, questionRequest, permissionResponding, decide],
  );
}

export type SessionComposerState = ReturnType<typeof useSessionComposerState>;
