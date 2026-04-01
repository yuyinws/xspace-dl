import { HttpClient } from "./http-client.js";
import type { CreateClientOptions, TwitterClient } from "./types.js";

const TWITTER_AUTHORIZATION =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const API_BASE_URL = "https://x.com/i/api";

function joinUrl(...parts: string[]): string {
  return parts.map((part) => part.replace(/^\/+|\/+$/g, "")).join("/");
}

class ApiClient {
  protected readonly http: HttpClient;
  protected readonly baseUrl: string;

  constructor(path: string, options: CreateClientOptions) {
    this.baseUrl = joinUrl(API_BASE_URL, path);
    this.http = new HttpClient(
      {
        authorization: TWITTER_AUTHORIZATION,
        "x-csrf-token": options.cookies.ct0,
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en",
      },
      options.cookies,
    );
  }

  getJson(path: string, params: Record<string, string> = {}) {
    return this.http.getJson(joinUrl(this.baseUrl, path), params);
  }
}

class GraphQLApi extends ApiClient {
  constructor(options: CreateClientOptions) {
    super("graphql", options);
  }

  audioSpaceById(spaceId: string) {
    const queryId = "pCUWlI5FNL7ROBjmBsH3Zw";
    const operationName = "AudioSpaceById";
    const variables = JSON.stringify({
      id: spaceId,
      isMetatagsQuery: true,
      withReplays: true,
      withListeners: true,
    });
    const features =
      '{"spaces_2022_h2_spaces_communities":true,"spaces_2022_h2_clipping":true,"creator_subscriptions_tweet_preview_api_enabled":true,"payments_enabled":false,"profile_label_improvements_pcf_label_in_post_enabled":true,"responsive_web_profile_redirect_enabled":false,"rweb_tipjar_consumption_enabled":true,"verified_phone_label_enabled":false,"premium_content_api_read_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"responsive_web_grok_analyze_button_fetch_trends_enabled":false,"responsive_web_grok_analyze_post_followups_enabled":true,"responsive_web_jetfuel_frame":true,"responsive_web_grok_share_attachment_enabled":true,"articles_preview_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"responsive_web_grok_show_grok_translated_post":false,"responsive_web_grok_analysis_button_from_backend":true,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_grok_image_annotation_enabled":true,"responsive_web_grok_imagine_annotation_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_grok_community_note_auto_translation_is_enabled":false,"responsive_web_enhance_cards_enabled":false}';

    return this.getJson(joinUrl(queryId, operationName), {
      variables,
      features,
    }) as Promise<Record<string, unknown>>;
  }
}

class FleetsApi extends ApiClient {
  constructor(options: CreateClientOptions) {
    super("fleets", options);
  }

  avatarContent(...userIds: string[]) {
    return this.getJson(joinUrl("v1", "avatar_content"), {
      user_ids: userIds.join(","),
      only_spaces: "true",
    }) as Promise<Record<string, unknown>>;
  }
}

class LiveVideoStreamApi extends ApiClient {
  constructor(options: CreateClientOptions) {
    super("1.1/live_video_stream", options);
  }

  status(mediaKey: string) {
    return this.getJson(joinUrl("status", mediaKey)) as Promise<
      Record<string, unknown>
    >;
  }
}

export function createClient(options: CreateClientOptions): TwitterClient {
  const graphql = new GraphQLApi(options);
  const fleets = new FleetsApi(options);
  const liveVideoStream = new LiveVideoStreamApi(options);
  const http = new HttpClient();

  return {
    graphql,
    fleets,
    liveVideoStream,
    http: {
      getText(url: string) {
        return http.getText(url);
      },
    },
  };
}
