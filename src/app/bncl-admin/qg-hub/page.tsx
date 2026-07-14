import { listQGHubContent } from "@/server/bncl-admin/client";
import {
  createQGHubContentAction,
  deleteQGHubContentAction,
  publishQGHubContentAction,
  unpublishQGHubContentAction,
} from "./actions";

// requireBnclAdmin() runs inside listQGHubContent() — a non-admin hitting
// this page directly gets a thrown BnclAdminRequiredError (error boundary),
// same pattern as /bncl-admin. Every action in ./actions.ts independently
// calls requireBnclAdmin() again inside the corresponding
// src/server/bncl-admin/client.ts function.
export default async function QGHubAdminPage() {
  const content = await listQGHubContent();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Q&amp;G Hub content management</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-600">New content</h2>
        <form action={createQGHubContentAction} className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium">Title</label>
            <input name="title" required className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Category</label>
            <input name="category" required className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Type</label>
            <select name="contentType" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="ARTICLE">Article</option>
              <option value="LESSON">Lesson</option>
            </select>
          </div>
          <div className="w-full">
            <label className="block text-xs font-medium">Body</label>
            <textarea name="body" rows={3} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create (draft)
          </button>
        </form>
      </section>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2">Title</th>
            <th className="py-2">Category</th>
            <th className="py-2">Type</th>
            <th className="py-2">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {content.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-2">{item.title}</td>
              <td className="py-2">{item.category}</td>
              <td className="py-2">{item.contentType}</td>
              <td className="py-2">{item.publishStatus}</td>
              <td className="py-2 flex gap-2">
                {item.publishStatus === "DRAFT" ? (
                  <form action={publishQGHubContentAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-xs text-brand-600 hover:underline">
                      Publish
                    </button>
                  </form>
                ) : (
                  <form action={unpublishQGHubContentAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-xs text-brand-600 hover:underline">
                      Unpublish
                    </button>
                  </form>
                )}
                <form action={deleteQGHubContentAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
