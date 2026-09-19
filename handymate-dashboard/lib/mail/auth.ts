import type { NextRequest } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser,hasPermission } from '@/lib/permissions'
export async function actor(request:NextRequest){const b=await getAuthenticatedBusiness(request);if(!b)throw new Error('Logga in för att hantera mejlkopplingen.');const u=await getCurrentUser(request,b.business_id);if(!u||!hasPermission(u,'manage_settings'))throw new Error('Företagets ägare behöver hantera mejlkopplingen.');return{businessId:b.business_id,userId:u.id}}
