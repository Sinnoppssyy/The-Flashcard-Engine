export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('pdf');
    if (!file) return Response.json({error:'No file.'},{status:400});
    if (file.type!=='application/pdf') return Response.json({error:'Only PDF files.'},{status:400});
    if (file.size>10*1024*1024) return Response.json({error:'Max 10MB.'},{status:400});
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    const text = parsed.text?.trim();
    if (!text||text.length<50) return Response.json({error:'Could not extract text. Use a text-based PDF, not a scanned image.'},{status:400});
    return Response.json({text, pages:parsed.numpages});
  } catch(e) { return Response.json({error:'Failed to read PDF: '+e.message},{status:500}); }
}