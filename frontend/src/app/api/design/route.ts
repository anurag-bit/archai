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
    const response = await fetch("http://127.0.0.1:8080/api/design", {
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

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Proxy error in /api/design:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
