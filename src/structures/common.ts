export interface PostSidecarNode {
  isVideo: boolean;
  displayUrl: string;
  videoUrl: string | null;
}

export interface PostLocation {
  id: number;
  name: string;
  slug: string;
  hasPublicPage: boolean | null;
  lat: number | null;
  lng: number | null;
}

export interface PostCommentAnswer {
  id: number;
  createdAtUtc: Date;
  text: string;
  owner: Profile;
  likesCount: number;
}

export function optionalNormalize(str: string | null | undefined): string | null {
  if (str != null && typeof str === "string") {
    return str.normalize("NFC");
  }
  return null;
}

export const HASHTAG_REGEX = /#(\w{1,150})/g;

export const MENTION_REGEX = /(?:^|[^\w\n]|_)@(\w(?:(?:\w|(?:\.(?!\.))){0,28}\w)?)/g;

export type JsonNode = Record<string, unknown>;

export interface Profile {
  readonly userid: number;
  readonly username: string;
  _asdict(): JsonNode;
}
