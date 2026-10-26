import { useState } from "react";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import type { QueueSession } from "../types";
import { todayEventDate } from "../utilities/schedule";
import { ScheduleFields } from "./ScheduleFields";
import { Modal } from "./ui";

export function EditSessionSchedule({ session }: { session: QueueSession }) {
  const { act, busy } = useApp();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(session.event_date ?? todayEventDate());
  const [time, setTime] = useState(session.start_time?.slice(0, 5) ?? "09:00");
  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setDate(session.event_date ?? todayEventDate());
          setTime(session.start_time?.slice(0, 5) ?? "09:00");
          setOpen(true);
        }}
      >
        Edit schedule
      </button>
      {open && (
        <Modal title="Edit session schedule" onClose={() => setOpen(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () =>
                    rpc("set_queue_schedule", {
                      p_session_id: session.id,
                      p_date: date,
                      p_time: time,
                    }),
                  "Session schedule updated.",
                )
              )
                setOpen(false);
            }}
          >
            <div className="form-grid">
              <ScheduleFields
                date={date}
                time={time}
                onDate={setDate}
                onTime={setTime}
              />
            </div>
            <div className="form-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                Save schedule
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
