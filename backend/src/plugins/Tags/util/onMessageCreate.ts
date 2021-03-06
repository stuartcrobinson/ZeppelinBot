import { TagsPluginType } from "../types";
import { SavedMessage } from "src/data/entities/SavedMessage";
import { PluginData } from "knub";
import { convertDelayStringToMS, resolveMember, tStrictMessageContent } from "src/utils";
import { validate } from "src/validatorUtils";
import { LogType } from "src/data/LogType";
import { TextChannel } from "eris";
import { matchAndRenderTagFromString } from "./matchAndRenderTagFromString";

export async function onMessageCreate(pluginData: PluginData<TagsPluginType>, msg: SavedMessage) {
  if (msg.is_bot) return;
  if (!msg.data.content) return;

  const member = await resolveMember(pluginData.client, pluginData.guild, msg.user_id);
  if (!member) return;

  const channel = pluginData.guild.channels.get(msg.channel_id) as TextChannel;
  const config = pluginData.config.getMatchingConfig({
    member,
    channelId: msg.channel_id,
    categoryId: channel.parentID,
  });

  const tagResult = await matchAndRenderTagFromString(pluginData, msg.data.content, member, {
    channelId: msg.channel_id,
    categoryId: channel.parentID,
  });

  if (!tagResult) {
    return;
  }

  // Check for cooldowns
  const cooldowns = [];

  if (tagResult.category) {
    // Category-specific cooldowns
    if (tagResult.category.user_tag_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.user_tag_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}-user-${msg.user_id}-tag-${tagResult.tagName}`, delay]);
    }
    if (tagResult.category.global_tag_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.global_tag_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}-tag-${tagResult.tagName}`, delay]);
    }
    if (tagResult.category.user_category_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.user_category_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}-user--${msg.user_id}`, delay]);
    }
    if (tagResult.category.global_category_cooldown) {
      const delay = convertDelayStringToMS(String(tagResult.category.global_category_cooldown), "s");
      cooldowns.push([`tags-category-${tagResult.categoryName}`, delay]);
    }
  } else {
    // Dynamic tag cooldowns
    if (config.user_tag_cooldown) {
      const delay = convertDelayStringToMS(String(config.user_tag_cooldown), "s");
      cooldowns.push([`tags-user-${msg.user_id}-tag-${tagResult.tagName}`, delay]);
    }

    if (config.global_tag_cooldown) {
      const delay = convertDelayStringToMS(String(config.global_tag_cooldown), "s");
      cooldowns.push([`tags-tag-${tagResult.tagName}`, delay]);
    }

    if (config.user_cooldown) {
      const delay = convertDelayStringToMS(String(config.user_cooldown), "s");
      cooldowns.push([`tags-user-${tagResult.tagName}`, delay]);
    }

    if (config.global_cooldown) {
      const delay = convertDelayStringToMS(String(config.global_cooldown), "s");
      cooldowns.push([`tags`, delay]);
    }
  }

  const isOnCooldown = cooldowns.some(cd => pluginData.cooldowns.isOnCooldown(cd[0]));
  if (isOnCooldown) return;

  for (const cd of cooldowns) {
    pluginData.cooldowns.setCooldown(cd[0], cd[1]);
  }

  const validationError = await validate(tStrictMessageContent, tagResult.renderedContent);
  if (validationError) {
    pluginData.state.logs.log(LogType.BOT_ALERT, {
      body: `Rendering tag ${tagResult.tagName} resulted in an invalid message: ${validationError.message}`,
    });
    return;
  }

  if (
    tagResult.renderedContent.content &&
    !tagResult.renderedContent.embed &&
    tagResult.renderedContent.content.trim() === ""
  ) {
    pluginData.state.logs.log(LogType.BOT_ALERT, {
      body: `Tag \`${tagResult.tagName}\` resulted in an empty message, so it couldn't be sent`,
    });
    return;
  }

  const responseMsg = await channel.createMessage(tagResult.renderedContent);

  // Save the command-response message pair once the message is in our database
  const deleteWithCommand = tagResult.category?.delete_with_command ?? config.delete_with_command;
  if (deleteWithCommand) {
    pluginData.state.savedMessages.onceMessageAvailable(responseMsg.id, async () => {
      await pluginData.state.tags.addResponse(msg.id, responseMsg.id);
    });
  }
}
