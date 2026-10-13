import type {
  AttachmentV2,
  ComponentV2,
  MediaV2,
  MessageV2,
} from "@abd-im/wasm-client-sdk";

export function getV2Preview(message?: MessageV2): string {
  if (!message) return "";
  const parts: string[] = [];
  const visit = (components: ComponentV2[]) => {
    for (const component of components) {
      if (component.content) parts.push(component.content);
      if (component.components) visit(component.components);
    }
  };
  visit(message.components);
  return parts.length
    ? parts.join("\n")
    : (message.attachments ?? []).map((file) => file.filename).join("\n");
}

export function resolveV2Media(media: MediaV2, attachments: AttachmentV2[] = []) {
  const attachment = attachments.find(
    (file) =>
      file.id === media.attachment_id ||
      file.url === media.url ||
      `attachment://${file.filename}` === media.url,
  );
  const url = attachment?.url || media.url;
  return {
    url: /^(https?:\/\/|blob:)/i.test(url) ? url : "",
    contentType: attachment?.content_type || media.content_type || "",
    filename: attachment?.filename,
    attachment,
    width: attachment?.width ?? media.width ?? 0,
    height: attachment?.height ?? media.height ?? 0,
  };
}
