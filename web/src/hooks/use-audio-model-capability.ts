import { useQuery } from '@tanstack/react-query';

import { AUDIO_MODEL_CAPABILITIES_QUERY_KEY, fetchAudioModelCapabilities, resolveAudioModelCapability } from '@/services/api/model-capabilities';
import { modelOptionName } from '@/stores/use-config-store';

export function useAudioModelCapability(model: string) {
    const query = useQuery({
        queryKey: AUDIO_MODEL_CAPABILITIES_QUERY_KEY,
        queryFn: fetchAudioModelCapabilities,
        staleTime: 5 * 60_000,
    });
    return { ...query, capability: resolveAudioModelCapability(query.data, modelOptionName(model)) };
}
