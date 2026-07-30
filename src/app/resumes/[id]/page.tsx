import { redirect } from "next/navigation";

export default async function EditResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/resumes?v=${id}`);
}
