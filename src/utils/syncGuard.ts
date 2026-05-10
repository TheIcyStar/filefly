


let remoteApplyDepth = 0

// Increment this counter before applying remote changes, and decrement it after. This allows us to track when we're in the middle of applying remote changes, so that we can avoid treating those changes as local edits that need to be pushed back to the database.
export function beginRemoteApply(): void {
    remoteApplyDepth += 1
}

export function endRemoteApply(): void {
    remoteApplyDepth = Math.max(0, remoteApplyDepth - 1)
}

export function isApplyingRemoteSync(): boolean {
    return remoteApplyDepth > 0
}

export async function runAsRemoteApply<T>(work: () => Promise<T>): Promise<T> {
    beginRemoteApply()
    try {
        return await work()
    } finally {
        endRemoteApply()
    }
}
