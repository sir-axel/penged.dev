import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

/** { [player_id]: { guild_id, tag, color, name } }, fetched once and shared by every [TAG] chip. */
export function useGuildTags() {
  const { data } = useQuery({
    queryKey: ["guild-tags"],
    staleTime: 60000,
    queryFn: async () => (await api.functions.invoke("guildTags")).data.tags || {},
  });
  return data || {};
}
