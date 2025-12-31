// =============================================================================
// instaloader-ts - Dual API Design
// =============================================================================
// Primary entry point exports the Promise-based client API.
// Effect users should import from "instaloader-ts/effect" for the Effect-based API.
// =============================================================================

// -----------------------------------------------------------------------------
// Client API (Promise-based, no Effect dependency for consumers)
// -----------------------------------------------------------------------------

export {
  Instaloader,
  type Result,
  Ok,
  Err,
  isOk,
  isErr,
  type Option,
  Some,
  None,
  isSome,
  isNone,
  type TypedAsyncIterable,
  type InstaloaderOptions,
  type Profile,
  type Post,
  type PostError,
} from "./client/index.ts";

// -----------------------------------------------------------------------------
// Plain Error Classes (no Effect dependency)
// -----------------------------------------------------------------------------

export {
  // Base
  InstaloaderBaseError,
  InstaloaderError,
  type ErrorTag,

  // Query errors
  QueryReturnedBadRequestError,
  QueryReturnedForbiddenError,
  QueryReturnedNotFoundError,
  type QueryError,

  // Profile errors
  ProfileNotExistsError,
  ProfileHasNoPicsError,
  PrivateProfileNotFollowedError,
  type ProfileError,

  // Auth errors
  LoginRequiredError,
  LoginError,
  TwoFactorAuthRequiredError,
  BadCredentialsError,
  type AuthenticationError,

  // Connection errors
  ConnectionError,
  TooManyRequestsError,
  type ConnectionErrors,

  // Response errors
  InvalidArgumentError,
  BadResponseError,
  PostChangedError,
  type ResponseError,

  // Feature errors
  IPhoneSupportDisabledError,
  AbortDownloadError,
  type FeatureError,

  // Union types
  type InstaloaderErrors,
  type AllContextErrors,

  // Type guards
  isInstaloaderError,
  isAuthenticationError,
  isConnectionError,
  isQueryError,
  isProfileError,
  isAbortDownloadError,
} from "./errors/index.ts";

// -----------------------------------------------------------------------------
// Effect-based API re-exports (for backward compatibility)
// Users who want the full Effect API should use "instaloader-ts/effect"
// -----------------------------------------------------------------------------

// Core utilities that don't conflict
export {
  getDefaultSessionFilename,
  formatStringContainsKey,
  PlatformLayer,
  getConfigDirEffect,
  getDefaultSessionFilenameEffect,
  saveSessionToFileEffect,
  loadSessionFromFileEffect,
  downloadFileEffect,
} from "./core/instaloader.ts";

export {
  InstaloaderContextLive,
  makeInstaloaderContext,
  type CookieJar,
  type InstaloaderContextOptions,
  type InstaloaderContextShape,
  defaultUserAgent,
  defaultIphoneHeaders,
} from "./core/context.ts";

export {
  type JsonNode,
  type PostLocation,
  type PostSidecarNode,
  type ProfileData,
  HASHTAG_REGEX,
  MENTION_REGEX,
  shortcodeToMediaid,
  mediaidToShortcode,
  shortcodeToMediaidSync,
  mediaidToShortcodeSync,
  fromShortcodeEffect,
  postFromMediaidEffect,
  postFromNode,
  postFromNodeSync,
  postShortcode,
  postMediaid,
  postDateUtc,
  postToString,
  postTypename,
  postIsVideo,
  postUrl,
  postCaption,
  postLikes,
  postComments,
  postSupportedGraphqlTypes,
  profileFromUsername,
  profileFromId,
  profileFromIphoneStruct,
  profileOwnProfile,
  profileUserid,
  profileUsername,
  profileIsPrivate,
  profileFollowedByViewer,
  profileMediacount,
  profileIgtvcount,
  profileFollowers,
  profileFollowees,
  profileExternalUrl,
  profileIsBusinessAccount,
  profileBusinessCategoryName,
  profileBiography,
  profileBiographyHashtags,
  profileBiographyMentions,
  profileBlockedByViewer,
  profileFollowsViewer,
  profileFullName,
  profileHasBlockedViewer,
  profileHasHighlightReels,
  profileHasRequestedViewer,
  profileIsVerified,
  profileRequestedByViewer,
  profileProfilePicUrl,
  profileGetIphoneStruct,
  profileGetProfilePicUrl,
  profileGetHasPublicStory,
  profileToDict,
  profileGetPostsStream,
  profileGetSavedPostsStream,
  profileGetTaggedPostsStream,
  profileGetReelsStream,
  profileGetIgtvPostsStream,
  storyItemFromMediaidEffect,
  hashtagFromNameEffect,
  hashtagGetPostsStream,
  hashtagGetTopPostsStream,
  type PostData,
} from "./structures/index.ts";

export {
  createNodeStream,
  resumableIterationStream,
  createSectionStream,
  type FrozenNodeIterator,
  type ResumableIterationResult,
  type NodeIteratorError,
  type SectionIteratorConfig,
} from "./iterators/index.ts";

// -----------------------------------------------------------------------------
// Effect-based Exceptions (namespaced to avoid conflicts)
// These are the Effect Data.TaggedError classes used internally
// -----------------------------------------------------------------------------

export * as EffectExceptions from "./exceptions/index.ts";

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

export {
  tryCatch,
  type Success,
  type Failure,
  type ResultSync,
  type ResultAsync,
} from "./utils/try-catch.ts";
