/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import z from 'zod'

// Historical execution targets were deterministically backfilled as PostgreSQL
// UUID values. PostgreSQL accepts every GUID-shaped value even when its variant
// bits do not describe an RFC 9562 UUID, so route parsing must match the stored
// identifier contract instead of rejecting a valid database key.
export const executionTargetRouteIdSchema = z.string().guid()
