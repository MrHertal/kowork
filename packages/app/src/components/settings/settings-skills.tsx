import { PlusIcon, Trash2Icon, WandSparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/contexts/dialog";
import { shallowArrayEqual, useGlobalData } from "@/contexts/global-sync";
import { useServer } from "@/contexts/server";
import { POPULAR_SKILLS, type PopularSkill } from "@/data/popular-skills";
import { type Skill, useManagedSkillsDir, useSkills } from "@/hooks/use-skills";
import { useSkillsMutation } from "@/hooks/use-skills-mutation";
import { m } from "@/paraglide/messages";
import {
  bundledSkillId,
  countSkillsInPath,
  findOwningPath,
  isSkillInPath,
} from "@/utils/skill-paths";

import { CustomSkill } from "./custom-skill";
import { IconAction } from "./icon-action";
import {
  SettingsListItem,
  SettingsListItemSkeleton,
} from "./settings-list-item";
import { SettingsSection } from "./settings-row";
import { SkillLogo } from "./skill-logo";

const emptyPaths: string[] = [];

interface SettingsSkillsProps {
  directory?: string;
}

export function SettingsSkills({ directory }: SettingsSkillsProps) {
  const server = useServer();
  const fallbackDirectory = useGlobalData((s) => s.path.directory);
  const resolved = directory ?? server.projects.last() ?? fallbackDirectory;

  if (!resolved) {
    return (
      <div className="flex flex-col gap-6">
        <ConnectedSection items={[]} paths={emptyPaths} ready={true} />
        <PopularSection items={POPULAR_SKILLS} />
      </div>
    );
  }

  return <SettingsSkillsContent directory={resolved} />;
}

function SettingsSkillsContent({ directory }: { directory: string }) {
  const skills = useSkills(directory);
  const managedDirQuery = useManagedSkillsDir();
  const managedDir = managedDirQuery.data;
  const paths = useGlobalData(
    (s) => s.config.skills?.paths ?? emptyPaths,
    shallowArrayEqual,
  );
  const skillsMutation = useSkillsMutation(directory);
  const items = skills.data ?? [];
  const [removalOpen, setRemovalOpen] = useState(false);
  // Retained through the close animation so the count stays right while fading.
  const [removalData, setRemovalData] = useState<{
    folder: string;
    count: number;
  } | null>(null);

  const pendingPrefix = (() => {
    if (!skillsMutation.isPending) return undefined;
    const v = skillsMutation.variables;
    if (v?.type === "remove-folder") return v.folder;
    if (v?.type === "uninstall-popular" && managedDir) {
      return `${managedDir}/${v.id}`;
    }
    return undefined;
  })();

  const installPending =
    skillsMutation.isPending &&
    skillsMutation.variables?.type === "install-popular"
      ? skillsMutation.variables.id
      : undefined;

  // Shared truth for Connected + Popular dedup: hide mid-removal rows so a
  // removed skill doesn't flash back into Popular before the refetch lands.
  const connected = useMemo(
    () =>
      pendingPrefix
        ? items.filter((skill) => !isSkillInPath(skill, pendingPrefix))
        : items,
    [items, pendingPrefix],
  );

  const popular = useMemo(() => {
    const connectedNames = new Set(connected.map((skill) => skill.name));
    return POPULAR_SKILLS.filter((skill) => !connectedNames.has(skill.id));
  }, [connected]);

  const handleRemove = (skill: Skill) => {
    const id = managedDir ? bundledSkillId(skill, managedDir) : null;
    if (id) {
      skillsMutation.mutate({ type: "uninstall-popular", id });
      return;
    }
    const folder = findOwningPath(skill, paths);
    if (!folder) return;
    const count = countSkillsInPath(items, folder);
    if (count > 1) {
      setRemovalData({ folder, count });
      setRemovalOpen(true);
      return;
    }
    skillsMutation.mutate({ type: "remove-folder", folder });
  };

  const confirmRemove = () => {
    if (!removalData) return;
    skillsMutation.mutate({
      type: "remove-folder",
      folder: removalData.folder,
    });
    setRemovalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <ConnectedSection
        items={connected}
        paths={paths}
        managedDir={managedDir}
        ready={!skills.isLoading}
        onRemove={handleRemove}
      />
      <PopularSection
        items={popular}
        installPending={installPending}
        onInstall={(id) =>
          skillsMutation.mutate({ type: "install-popular", id })
        }
      />
      <AlertDialog open={removalOpen} onOpenChange={setRemovalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.settings_skills_remove_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removalData &&
                m.settings_skills_remove_confirm_description({
                  count: removalData.count,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRemove}>
              {m.settings_skills_remove()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ConnectedSectionProps {
  items: Skill[];
  paths: readonly string[];
  managedDir?: string | null;
  ready: boolean;
  onRemove?: (skill: Skill) => void;
}

function ConnectedSection({
  items,
  paths,
  managedDir,
  ready,
  onRemove,
}: ConnectedSectionProps) {
  const showList = ready && items.length > 0;
  return (
    <SettingsSection
      title={m.settings_skills_section_connected()}
      bordered={showList}
    >
      {!ready ? (
        <ConnectedLoading />
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {m.settings_skills_connected_empty()}
        </p>
      ) : (
        items.map((skill) => {
          const bundledId = managedDir
            ? bundledSkillId(skill, managedDir)
            : null;
          // No trash until managedDir resolves — misrouting a delete is unsafe.
          const removable =
            bundledId !== null ||
            (managedDir !== undefined && findOwningPath(skill, paths) !== null);
          return (
            <SettingsListItem
              key={skill.name}
              icon={<SkillLogo alt={`${skill.name} logo`} />}
              title={skill.name}
              description={skill.description}
              action={
                removable ? (
                  <div className="flex items-center gap-2">
                    <IconAction
                      icon={<Trash2Icon />}
                      label={m.settings_skills_remove()}
                      onClick={() => onRemove?.(skill)}
                    />
                  </div>
                ) : undefined
              }
            />
          );
        })
      )}
    </SettingsSection>
  );
}

interface PopularSectionProps {
  items: PopularSkill[];
  installPending?: string;
  onInstall?: (id: string) => void;
}

function PopularSection({
  items,
  installPending,
  onInstall,
}: PopularSectionProps) {
  const dialog = useDialog();
  const openCustom = () => dialog.show(() => <CustomSkill />);

  return (
    <SettingsSection title={m.settings_skills_section_popular()}>
      {items.map((skill) => (
        <SettingsListItem
          key={skill.id}
          icon={<SkillLogo src={skill.logo} alt={`${skill.name} logo`} />}
          title={skill.name}
          description={skill.description()}
          action={
            <ConnectButton
              onClick={() => onInstall?.(skill.id)}
              ariaLabel={skill.name}
              disabled={installPending === skill.id}
            />
          }
        />
      ))}

      <SettingsListItem
        icon={
          <WandSparklesIcon className="size-5 shrink-0 text-muted-foreground" />
        }
        title={m.settings_skills_custom_label()}
        badge={
          <Badge variant="outline">{m.dialog_provider_tag_custom()}</Badge>
        }
        description={m.settings_skills_custom_description()}
        action={
          <ConnectButton
            onClick={openCustom}
            ariaLabel={m.settings_skills_custom_label()}
          />
        }
      />
    </SettingsSection>
  );
}

interface ConnectButtonProps {
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}

function ConnectButton({ onClick, ariaLabel, disabled }: ConnectButtonProps) {
  return (
    <>
      <Button
        variant="secondary"
        size="icon-sm"
        className="sm:hidden"
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel ?? m.settings_skills_connect()}
      >
        <PlusIcon />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="hidden sm:inline-flex"
        disabled={disabled}
        onClick={onClick}
      >
        <PlusIcon />
        {m.settings_skills_connect()}
      </Button>
    </>
  );
}

function ConnectedLoading() {
  return (
    <div className="space-y-2">
      <SettingsListItemSkeleton />
      <SettingsListItemSkeleton />
    </div>
  );
}
