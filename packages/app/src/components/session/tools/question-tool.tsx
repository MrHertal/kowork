import { MessageCircleQuestionIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

interface QuestionOption {
  label: string;
  description: string;
}

interface QuestionInfo {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

type QuestionAnswer = string[];

export function QuestionTool(props: ToolProps) {
  const questions = (props.input.questions ?? []) as QuestionInfo[];
  const answers = (props.metadata.answers ?? []) as QuestionAnswer[];
  const completed = answers.length > 0;

  const subtitle =
    questions.length > 0
      ? completed
        ? m.session_question_answered_count({ count: String(questions.length) })
        : questions.length === 1
          ? m.session_question_count_one({ count: String(questions.length) })
          : m.session_question_count({ count: String(questions.length) })
      : undefined;

  return (
    <BasicTool
      icon={<MessageCircleQuestionIcon />}
      title={m.session_tool_questions()}
      subtitle={subtitle}
      status={props.status}
      defaultOpen={completed}
    >
      {completed && (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={i} className="space-y-1">
              <div className="text-sm font-medium">{q.question}</div>
              <div className="text-sm text-muted-foreground">
                {answers[i]?.join(", ") || m.session_question_no_answer()}
              </div>
            </div>
          ))}
        </div>
      )}
    </BasicTool>
  );
}
