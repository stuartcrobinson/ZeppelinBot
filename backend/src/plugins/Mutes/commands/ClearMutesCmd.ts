import { command } from "knub";
import { MutesPluginType } from "../types";
import { sendErrorMessage, sendSuccessMessage } from "../../../pluginUtils";
import { commandTypeHelpers as ct } from "../../../commandTypes";

export const ClearMutesCmd = command<MutesPluginType>()({
  trigger: "clear_mutes",
  permission: "can_cleanup",
  description: "Clear dangling mute records from the bot. Be careful not to clear valid mutes.",

  signature: {
    userIds: ct.string({ rest: true }),
  },

  async run({ pluginData, message: msg, args }) {
    const failed = [];
    for (const id of args.userIds) {
      const mute = await pluginData.state.mutes.findExistingMuteForUserId(id);
      if (!mute) {
        failed.push(id);
        continue;
      }
      await pluginData.state.mutes.clear(id);
    }

    if (failed.length !== args.userIds.length) {
      sendSuccessMessage(pluginData, msg.channel, `**${args.userIds.length - failed.length} active mute(s) cleared**`);
    }

    if (failed.length) {
      sendErrorMessage(
        pluginData,
        msg.channel,
        `**${failed.length}/${args.userIds.length} IDs failed**, they are not muted: ${failed.join(" ")}`,
      );
    }
  },
});
