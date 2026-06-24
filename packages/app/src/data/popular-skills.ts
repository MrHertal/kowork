import { m } from "@/paraglide/messages";

export interface PopularSkill {
  id: string;
  name: string;
  description: () => string;
  logo?: string;
}

export const POPULAR_SKILLS: PopularSkill[] = [
  {
    id: "skill-creator",
    name: "skill-creator",
    description: m.settings_skills_popular_skillCreator_description,
  },
];
