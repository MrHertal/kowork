import { m } from "@/paraglide/messages";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function FeedbackButton() {
  return (
    <Card className="gap-2 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{m.feedback_title()}</CardTitle>
        <CardDescription>{m.feedback_description()}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <div className="grid gap-2.5">
          <Button
            className="w-full bg-sidebar-primary text-sidebar-primary-foreground shadow-none"
            size="sm"
          >
            {m.feedback_button()}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
