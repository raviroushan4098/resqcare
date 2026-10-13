"use client";

import { Check, Circle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { HAPPY_PATH, type BookingEvent, type BookingStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const TERMINAL_BAD: BookingStatus[] = ["Cancelled", "Rejected", "TimedOut", "Failed"];

/** Requested -> Completed with timestamps; terminal failures shown distinctly; changes announced live. */
export function BookingTimeline({ status, events }: { status: BookingStatus; events: BookingEvent[] }) {
  const t = useTranslations("booking.status");
  const tl = useTranslations("booking");
  const failed = TERMINAL_BAD.includes(status);
  const reachedIdx = Math.max(...events.map((e) => HAPPY_PATH.indexOf(e.state)).filter((i) => i >= 0), 0);
  const at = (s: BookingStatus) => events.find((e) => e.state === s)?.at;
  const [announce, setAnnounce] = useState("");
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current !== status) setAnnounce(tl("announce", { status: t(status) }));
    prev.current = status;
  }, [status, t, tl]);

  return (
    <div>
      <p aria-live="assertive" className="sr-only">{announce}</p>
      <ol className="space-y-0">
        {HAPPY_PATH.map((s, i) => {
          const done = i < reachedIdx || (i === reachedIdx && s === "Completed");
          const current = !failed && i === reachedIdx && s !== "Completed";
          return (
            <li key={s} aria-current={current ? "step" : undefined} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2",
                    done ? "border-confirmed bg-confirmed text-white" : current ? "border-primary bg-tint-primary text-primary-hover" : "border-border-strong bg-surface text-muted",
                  )}
                >
                  {done ? <Check aria-hidden="true" className="h-4 w-4" /> : <Circle aria-hidden="true" className={cn("h-3 w-3", current && "fill-current motion-safe:animate-pulse")} />}
                </span>
                {i < HAPPY_PATH.length - 1 ? <span aria-hidden="true" className={cn("w-0.5 flex-1 min-h-[20px]", done ? "bg-confirmed" : "bg-border")} /> : null}
              </div>
              <div className="pb-4">
                <p className={cn("font-semibold", !done && !current && "text-muted")}>
                  {t(s)}
                  <span className="sr-only">{done ? `, ${tl("done")}` : current ? `, ${tl("current")}` : `, ${tl("upcoming")}`}</span>
                </p>
                {at(s) ? <p className="text-sm text-muted"><RelativeTime iso={at(s)!} /></p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {failed ? (
        <div className="mt-2 flex items-center gap-2 rounded-control border-2 border-emergency bg-tint-emergency p-3 font-semibold text-emergency">
          <XCircle aria-hidden="true" className="h-5 w-5" />
          {t(status)}
          {at(status) ? <span className="font-normal text-text">· <RelativeTime iso={at(status)!} /></span> : null}
        </div>
      ) : null}
    </div>
  );
}
