import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { fetchVideoModelCapabilities, resolveVideoModelCapability } from '@/services/api/model-capabilities';
import { RUNTIME_CONFIG_CHANGED_EVENT } from '@/services/runtime-config';
import { modelOptionName } from '@/stores/use-config-store';

export function useVideoModelCapability(model: string) {
    const query = useQuery({
        queryKey: ['video-model-capabilities'],
        queryFn: fetchVideoModelCapabilities,
        staleTime: 5 * 60_000,
    });
    useEffect(() => {
        const refresh = () => void query.refetch();
        window.addEventListener(RUNTIME_CONFIG_CHANGED_EVENT, refresh);
        return () => window.removeEventListener(RUNTIME_CONFIG_CHANGED_EVENT, refresh);
    }, [query.refetch]);
    return {
        ...query,
        capability: resolveVideoModelCapability(query.data, modelOptionName(model)),
    };
}
