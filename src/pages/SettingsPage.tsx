import {
  CheckCircle2,
  ExternalLink,
  Database,
  KeyRound,
  UserRound,
  Radio,
  CloudUpload,
  ClipboardList,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { Badge, PageHeader } from "../components/ui";

export function SettingsPage() {
  const { configured, user, live } = useApp();
  return (
    <>
      <PageHeader
        title="Settings & setup"
        subtitle="A small setup now. A smoother game day later."
        eyebrow="YOUR WORKSPACE"
      />
      <div className="grid-2 settings-grid">
        <section className="card">
          <div className="card-header">
            <h2>Workspace connection</h2>
            <Badge tone={configured ? "green" : "orange"}>
              {configured ? "Configured" : "Action needed"}
            </Badge>
          </div>
          <div className="settings-status">
            <div>
              <Database size={19} />
              <span>Supabase credentials</span>
              <strong>{configured ? "Added" : "Not added"}</strong>
            </div>
            <div>
              <UserRound size={19} />
              <span>Organizer</span>
              <strong>{user?.email ?? "Not signed in"}</strong>
            </div>
            <div>
              <Radio size={19} />
              <span>Realtime</span>
              <strong>{live ? "Connected" : "Not connected"}</strong>
            </div>
          </div>
          <p className="callout">
            Your database is the source of truth. This app does not save
            tournaments or queues to temporary browser storage.
          </p>
        </section>
        <section className="card">
          <div className="card-header">
            <h2>What you enter on game day</h2>
            <ClipboardList size={20} />
          </div>
          <ul className="checklist">
            <li>
              <CheckCircle2 />
              <span>
                <strong>Players:</strong> their names. Photos are optional.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Tournaments:</strong> name, date, singles/doubles,
                bracket format, court count, and one game/best of three.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Participants:</strong> select players, form pairs for
                doubles, and choose the seeding order.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Queues:</strong> session name, courts, play type, and
                who wants to play.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Matches:</strong> available court, points or completed
                game scores, and confirmation of the result.
              </span>
            </li>
          </ul>
        </section>
      </div>
      <section className="card setup-instructions">
        <div className="card-header">
          <div>
            <h2>Connect Qmaster in five steps</h2>
            <p>You only need to do this once.</p>
          </div>
          <KeyRound size={21} />
        </div>
        <ol className="setup-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Create your Supabase project</h3>
              <p>
                Use a free project. Copy its Project URL and publishable key
                from the project’s API settings.
              </p>
              <a
                className="text-link"
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Open Supabase <ExternalLink size={13} />
              </a>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Add two environment variables</h3>
              <p>
                Copy <code>.env.example</code> to <code>.env.local</code> in the
                project folder and fill in:
              </p>
              <pre>
                VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co{"\n"}
                VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
              </pre>
              <p>
                Restart <code>npm run dev</code> after saving. Use the
                publishable key; keep secret and service-role keys out of the
                app.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Create your database</h3>
              <p>
                Run the SQL migration files in <code>supabase/migrations/</code>{" "}
                in filename order through Supabase’s SQL Editor. They create
                tables, security policies, match functions, the media bucket,
                and Realtime publication.
              </p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>Create the organizer login</h3>
              <p>
                In Authentication → Users, add an email/password user and
                confirm its email. Disable new user sign-ups in Auth settings.
                The database automatically creates the organizer profile.
              </p>
              <p>
                Set your Site URL and allowed redirect URLs to your localhost
                address and deployed domain.
              </p>
            </div>
          </li>
          <li>
            <span>05</span>
            <div>
              <h3>Sign in, then deploy when ready</h3>
              <p>
                Run <code>npm install</code> and <code>npm run dev</code>. On
                Vercel, import your GitHub repository and set the same two
                variables before deploying. The included configuration handles
                page refreshes.
              </p>
              <p>
                Check <code>README.md</code> for the complete instructions and a
                two-device validation checklist.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <div className="callout">
        <CloudUpload size={18} />
        <span>
          Images are optional. JPG, PNG, and WebP files up to 3 MB use the
          private Supabase Storage bucket. You can run every game without
          uploading anything.
        </span>
      </div>
    </>
  );
}
