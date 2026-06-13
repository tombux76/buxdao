"use client";

import { Card } from "@/components/ui/Card";
import { HubDiscordStep } from "@/components/hub/HubDiscordStep";
import { hubContent } from "@/content/site";

export function HubSetupSteps() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {hubContent.steps.map((step) => (
        <Card key={step.step} className="p-5">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent-purple/20 font-mono text-sm text-accent-purple">
            {step.step}
          </div>
          <h3 className="mb-2 font-semibold">{step.title}</h3>
          <p className="text-sm text-muted">{step.body}</p>
          {step.step === 1 && <HubDiscordStep />}
        </Card>
      ))}
    </div>
  );
}
