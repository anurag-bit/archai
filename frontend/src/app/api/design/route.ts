import { NextResponse } from "next/server";

export const maxDuration = 300; // Allow 5 minutes on Vercel/production if deployed

export async function POST(request: Request) {
  try {
    const incomingFormData = await request.formData();
    const requirements = (incomingFormData.get("requirements") as string) || "";
    const documentFile = incomingFormData.get("document") as File | null;
    const techStack = (incomingFormData.get("tech_stack") as string) || "";
    const designPrinciples = (incomingFormData.get("design_principles") as string) || "";
    const securityProtocols = (incomingFormData.get("security_protocols") as string) || "";
    const cloudProvider = (incomingFormData.get("cloud_provider") as string) || "aws";

    // Create a new standard FormData instance to send via fetch
    const formData = new FormData();
    formData.append("requirements", requirements);
    if (documentFile && documentFile.size > 0) {
      formData.append("document", documentFile);
    }
    formData.append("tech_stack", techStack);
    formData.append("design_principles", designPrinciples);
    formData.append("security_protocols", securityProtocols);
    formData.append("cloud_provider", cloudProvider);

    // Forward the request to the backend
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8080";
    const response = await fetch(`${backendUrl}/api/design`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json(errorJson, { status: response.status });
      } catch {
        return new NextResponse(errorText, {
          status: response.status,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    // Stream the backend response back to the client
    const stream = new ReadableStream({
      async start(controller) {
        if (!response.body) {
          controller.close();
          return;
        }
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (e) {
          controller.error(e);
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    });
  } catch (error: any) {
    console.error("Proxy error in /api/design:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
