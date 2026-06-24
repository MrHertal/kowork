import { Search, X } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import {
  useSearchSessions,
  useSearchSessionsData,
} from "@/contexts/search-sessions";
import { m } from "@/paraglide/messages";

export function SearchForm() {
  const query = useSearchSessionsData((s) => s.query);
  const loading = useSearchSessionsData((s) => s.loading);
  const { setQuery } = useSearchSessions();

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <SidebarGroup className="mt-1 px-4 py-0">
        <SidebarGroupContent>
          <Label htmlFor="search" className="sr-only">
            {m.sidebar_search_label()}
          </Label>
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              id="search"
              placeholder={m.sidebar_search_placeholder()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {loading ? (
              <InputGroupAddon align="inline-end">
                <Spinner />
              </InputGroupAddon>
            ) : query !== "" ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={m.common_search_clear()}
                  onClick={() => setQuery("")}
                >
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  );
}
