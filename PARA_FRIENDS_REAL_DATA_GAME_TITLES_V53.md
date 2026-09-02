# PARA Friends Real Data + Game Titles V53

V53 removes the fake/local people layer from Friends and fixes achievement folders that could fall back to the generic `PARA Game` label.

## Friends

- Removed demo friends, fake recent chats, `Conversation 2`, local chat creation, and browser-profile chat storage from the Friends app.
- Local PARA profiles are no longer treated as friends or chat identities.
- Friends is now a cleaner console-style system app with Friends, Chats, and Parties sections.
- Until the real online Friends service is connected, each section shows an honest empty state instead of fabricated people or conversations.
- Removed the fake friend-presence notification from consumer sample content.
- Cleaned the old unused social/calls screen so it cannot reintroduce fake people.

## Achievement game folders

Achievement folders now resolve their identity through multiple real sources:

1. ParaStore `project_id`.
2. ParaStore/store entry id carried by the achievement record.
3. The recent/running game runtime entry.
4. The store artwork/title identity saved during launch.
5. A direct store-product lookup when a store id is known but missing from the catalog snapshot.

The generic `PARA Game` achievement-folder fallback is gone. A genuinely unresolved title is labeled `Unknown Game` instead.

This fixes the case where trophies belonging to a real published game appeared under a generic PARA Game folder even though the runtime still knew which store title produced them.

## Legacy fake-data cleanup

The old unused `apps/para-home/src/mock-data.js` and `services/mock-api` tree were removed. They were already expected to be absent by the repository regression suite and were not referenced by the live consumer application.

## Verification

- Changed frontend JavaScript syntax checks passed.
- Python API compile check passed.
- API + repository suite: **91 passed**.
