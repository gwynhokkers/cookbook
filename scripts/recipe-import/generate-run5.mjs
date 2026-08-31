#!/usr/bin/env node
/**
 * DEPRECATED — one-off Curry run5 draft generator. Do not use for production upload.
 *
 * Output is parser-driven and requires per-recipe manual review against OCR.
 * Upload is blocked until: node scripts/recipe-import/audit-recipes.mjs --book curry --run 5
 * See docs/agents/recipe-import.md
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { structureMarkdownSection, slugify } from './parse-recipe.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PAGES = path.join(HERE, 'out/curry/pages')
const OUTPUT = path.join(HERE, 'out/curry/recipes-run5')
const SOURCE = 'Curry Easy — Atul Kochhar'

/** @type {Array<{num: number, slug: string, title: string, pages: string[], tag: string, merge?: boolean}>} */
const MANIFEST = [
  { num: 1, slug: 'cari-chay', title: 'Cari Chay (Vegetable and tofu curry)', pages: ['Curry_8_p1.md'], tag: 'vietnam' },
  { num: 2, slug: 'rau-muong-xao', title: 'Rau Muong Xao (Stir-fried water spinach)', pages: ['Curry_8_p2.md'], tag: 'vietnam' },
  { num: 3, slug: 'banh-mi', title: 'Banh Mi (Saigon baguette)', pages: ['Curry_8_p3.md'], tag: 'vietnam' },
  { num: 4, slug: 'butter-bean-curry', title: 'Butter Bean Curry', pages: ['Curry_8_p4.md'], tag: 'south-africa' },
  { num: 5, slug: 'mtuzi-wa-samaki', title: 'Mtuzi wa Samaki (Kenyan fish curry)', pages: ['Curry_8_p5.md'], tag: 'south-africa' },
  { num: 6, slug: 'crab-and-mango-curry', title: 'Crab and Mango Curry', pages: ['Curry_8_p6.md'], tag: 'south-africa' },
  { num: 7, slug: 'plantain-curry', title: 'Plantain Curry', pages: ['Curry_8_p7.md'], tag: 'south-africa' },
  { num: 8, slug: 'bunny-chow', title: 'Bunny Chow (Curried beans in a loaf)', pages: ['Curry_8_p8.md'], tag: 'south-africa' },
  { num: 9, slug: 'bobotie', title: 'Bobotie (Spiced mince baked with savoury custard)', pages: ['Curry_8_p9.md'], tag: 'south-africa' },
  { num: 10, slug: 'trinidadian-roti', title: 'Trinidadian Roti (Curried prawns in split pea flatbread)', pages: ['Curry_8_p10.md'], tag: 'caribbean' },
  { num: 11, slug: 'jamaican-goat-curry', title: 'Jamaican Goat Curry', pages: ['Curry_8_p11.md'], tag: 'caribbean' },
  { num: 12, slug: 'doubles', title: 'Doubles (Bara and curried chickpeas)', pages: ['Curry_8_p12.md'], tag: 'caribbean' },
  { num: 13, slug: 'river-lime-curried-duck', title: "River Lime Curried Duck", pages: ['Curry_8_p13.md'], tag: 'caribbean' },
  { num: 14, slug: 'leilas-guyanese-chicken-curry', title: "Leila's Guyanese Chicken Curry", pages: ['Curry_8_p14.md'], tag: 'caribbean' },
  { num: 15, slug: 'dhansak', title: 'Dhansak (Lamb with lentils and tamarind)', pages: ['Curry_8_p15.md'], tag: 'british' },
  { num: 16, slug: 'madras-curry', title: 'Madras Curry (Fiery lamb curry)', pages: ['Curry_8_p16.md'], tag: 'british' },
  { num: 17, slug: 'rogan-josh', title: 'Rogan Josh (Lamb curry with aromatic spices)', pages: ['Curry_8_p17.md'], tag: 'british' },
  { num: 18, slug: 'chicken-korma', title: 'Chicken Korma (Creamy chicken curry with nuts)', pages: ['Curry_8_p18.md', 'Curry_8_p19.md'], tag: 'british' },
  { num: 19, slug: 'chicken-tikka-masala', title: 'Chicken Tikka Masala', pages: ['Curry_8_p20.md'], tag: 'british' },
  { num: 20, slug: 'prawn-balti', title: 'Prawn Balti', pages: ['Curry_9_p1.md'], tag: 'british' },
  { num: 21, slug: 'curry-nanban-soba', title: 'Curry Nanban Soba (Curry noodle with chicken)', pages: ['Curry_9_p2.md'], tag: 'japanese' },
  { num: 22, slug: 'curry-rice', title: 'Curry Rice', pages: ['Curry_9_p3.md'], tag: 'japanese' },
  { num: 23, slug: 'katsu-curry', title: 'Katsu Curry (Curry rice with pork steaks)', pages: ['Curry_9_p4.md'], tag: 'japanese' },
  { num: 24, slug: 'ghee', title: 'Ghee (Clarified butter)', pages: ['Scan_1_p1.md'], tag: 'basics' },
  { num: 25, slug: 'garam-masala', title: 'Garam Masala (Hot spice mix)', pages: ['Scan_1_p2.md'], tag: 'basics' },
  { num: 26, slug: 'laal-maas', title: 'Laal Maas (Fiery lamb curry)', pages: ['Scan_1_p3.md'], tag: 'rajasthan' },
  { num: 27, slug: 'makai-ka-soweta', title: 'Makai ka Soweta (Lamb and sweetcorn curry)', pages: ['Scan_1_p4.md'], tag: 'rajasthan' },
  { num: 28, slug: 'achari-khargosh', title: 'Achari Khargosh (Rabbit leg cooked in pickling spices)', pages: ['Scan_1_p5.md'], tag: 'rajasthan' },
  { num: 29, slug: 'pitod-ka-saag', title: 'Pitod ka Saag (Chickpea flour dumplings in yogurt sauce)', pages: ['Scan_1_p6.md'], tag: 'rajasthan' },
  { num: 30, slug: 'panchmael-daal', title: 'Panchmael Daal (Five lentils mix)', pages: ['Scan_1_p7.md'], tag: 'rajasthan' },
  { num: 31, slug: 'lahsun-ki-chutney', title: 'Lahsun ki Chutney (Garlic chutney)', pages: ['Scan_1_p8.md'], tag: 'rajasthan' },
  { num: 32, slug: 'missi-roti', title: 'Missi Roti (Chickpea bread)', pages: ['Scan_1_p9.md'], tag: 'rajasthan' },
  { num: 33, slug: 'kadhai-paneer', title: 'Kadhai Paneer (Stir-fry of paneer cheese with peppers)', pages: ['Scan_1_p10.md'], tag: 'rajasthan' },
  { num: 34, slug: 'subz-saag-gosht', title: 'Subz Saag Gosht (Lamb cooked with winter vegetables and spinach)', pages: ['Scan_1_p11.md'], tag: 'rajasthan' },
  { num: 35, slug: 'dahi-wali-machli', title: 'Dahi Wali Machli (Catfish in yogurt sauce)', pages: ['Scan_1_p12.md'], tag: 'rajasthan' },
  { num: 36, slug: 'daal-makhani', title: 'Daal Makhani (Black lentils)', pages: ['Scan_1_p13.md'], tag: 'rajasthan' },
  { num: 37, slug: 'naan', title: 'Naan (Naan bread)', pages: ['Scan_1_p14.md'], tag: 'basics' },
  { num: 38, slug: 'nalli-gosht', title: 'Nalli Gosht (Slow-braised lamb shank in saffron sauce)', pages: ['Scan_1_p15.md'], tag: 'rajasthan' },
  { num: 39, slug: 'kachhi-mirch-ka-gosht', title: 'Kachhi Mirch ka Gosht (Lamb shoulder with green chillies, mint and yogurt)', pages: ['Scan_1_p16.md'], tag: 'rajasthan' },
  { num: 40, slug: 'rezala', title: 'Rezala (Bhopal-style goat curry)', pages: ['Scan_1_p17.md'], tag: 'rajasthan' },
  { num: 41, slug: 'subz-miloni', title: 'Subz Miloni (Seasonal vegetables in spinach and garlic sauce)', pages: ['Scan_1_p18.md'], tag: 'rajasthan' },
  { num: 42, slug: 'bateyr-masala', title: 'Bateyr Masala (Quails in spicy curry)', pages: ['Scan_1_p19.md'], tag: 'rajasthan' },
  { num: 43, slug: 'gucchi-aur-murgh-kalia', title: 'Gucchi aur Murgh Kalia (Chicken and morel curry)', pages: ['Scan_1_p20.md'], tag: 'rajasthan' }
]

function cleanDescription(text) {
  return String(text || '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/&lt;/g, '<')
    .replace(/\bI\b(?=\s+(tbsp|tsp|minute|hour|cm|oz))/g, '1')
    .replace(/\bl\b(?=\s*(cm|in|oz|b))/g, '1')
    .replace(/\s+/g, ' ')
    .replace(/\s*Serves \d+.*$/i, '')
    .replace(/^(light|warmly|mild|rich|hot|spicy|tangy|souplike|fullflavoured|colourful|thin|fresh|slightly|chilli hot)\b[^.]*\s*/i, '')
    .trim()
}

function cleanIngredient(ing) {
  const name = ing.ingredientName
    .replace(/^arge /, 'large ')
    .replace(/^(\d+)\s+l\s/, '$1 ')
    .replace(/\bI\s+(tbsp|tsp|minute|hour|cm)\b/g, '1 $1')
    .trim()
  return {
    ingredientName: name,
    amount: (ing.amount || '').replace(/^I$/, '1').trim(),
    unit: ing.unit === 'l' && !name.includes('litre') ? 'pieces' : (ing.unit || 'pieces'),
    notes: (ing.notes || '').trim()
  }
}

function extractFromMarkdown(md, fallbackTitle) {
  const text = String(md || '')
    .replace(/&lt;/g, '<')
    .replace(/\|[^|]+\|/g, (row) => row.replace(/\|/g, ' '))
    .replace(/<!--.*?-->/gs, '')
    .trim()

  const headingMatch = text.match(/^##\s+(.+)$/m) || text.match(/^([A-Za-z][^\n]+)$/m)
  const rawTitle = headingMatch ? headingMatch[1].trim() : fallbackTitle

  const bodyStart = headingMatch ? text.indexOf(headingMatch[0]) + headingMatch[0].length : 0
  const body = text.slice(bodyStart).trim()

  const structured = structureMarkdownSection(rawTitle, body)
  return structured
}

async function loadPageBody(pages) {
  const parts = []
  for (const p of pages) {
    parts.push(await readFile(path.join(PAGES, p), 'utf8'))
  }
  return parts.join('\n\n')
}

/** Corrected method steps where OCR scrambled order */
const METHOD_OVERRIDES = {
  'rau-muong-xao': [
    'Heat the oil in a frying pan or wok over a high heat and stir-fry the garlic for about 2 minutes or until fragrant and lightly golden. Add the water spinach, fish sauce, sugar and pepper and cover the pan. Cook for 5 minutes.',
    'Remove the lid, toss a few more times and serve hot.'
  ],
  'curry-rice': [
    'Put the rice in a bowl and wash under cold running water for 2 minutes. Drain in a sieve. Pour 550ml (18fl oz) water into a large pan with a tight-fitting lid, add the rice and set aside to soak.',
    'Heat the oil and half of the butter in a frying pan until the butter melts, then fry the beef over a moderately high heat until browned all over. Remove with a slotted spoon and place on a plate.',
    'To make the curry roux, add the sliced onion to the frying pan and reduce the heat to low. Fry for 30–40 minutes or until the onion is soft and well browned. Stir in the garlic, ginger and curry powder and fry for 2 minutes. Add the flour and stir to absorb the oil. Add the chutney, ketchup and shoyu and mix well. The roux should look like a thick brown paste. Remove from the heat.',
    'Now start cooking the rice. Place the lid tightly on the pan and bring to the boil. As soon as you hear a bubbling noise, turn the heat down to low and simmer for 10 minutes or until the bubbling noise disappears and a faint crackling noise starts. Remove the pan from the heat, without lifting the lid, and leave aside for at least 10 minutes before checking the rice.',
    'While the rice is cooking, melt the remaining butter in another deep pan and add the onion chunks and then the browned beef. Fry for 3 minutes. Add the potatoes, carrot and bay leaf and pour in the stock. Bring to the boil. Reduce the heat and simmer for 20 minutes or until the potatoes and carrot are tender. Skim off any scum from the surface.',
    'Scoop out about 500ml (16fl oz) of the hot stock and add to the curry roux in the frying pan. Mix well into a smooth and runny mixture. Add this to the rest of the stock in the deep pan and stir in thoroughly. Add salt and pepper to taste. Bring back to the boil and cook for a further 2 minutes.',
    'Serve the curry on a bed of warm rice, with some pickles if you like.'
  ],
  'butter-bean-curry': [
    'Heat the vegetable oil in a karahi or wok. When hot, toss in the mustard seeds, followed by the curry leaves and fenugreek seeds. After about 30 seconds, the spices will give off a nutty aroma.',
    'Add the onions and soften over a low heat for about 10 minutes. Stir in the ginger, garlic and green chillies and continue frying until the onions are flecked golden.',
    'Turn the heat up slightly, add the chopped tomatoes to the pan and cook until thickened and darkened in colour. Tip in the carrot and sprinkle over the ground coriander, turmeric, chilli powder, cumin and garam masala. Fry briskly for 1 minute before pouring over 150ml (5fl oz) hot water. Cover the pan and simmer for 10–15 minutes or until the carrots are just tender.',
    'Stir in the red pepper and green beans and continue cooking, uncovered, for 10 minutes or until the vegetables are softened.',
    'Add the butter beans and pour in another 150ml (5fl oz) hot water. Half cover the pan and simmer for a further 10 minutes. You might need to add more water as the beans cook.',
    'Garnish with chopped coriander and serve with boiled rice.'
  ],
  'crab-and-mango-curry': [
    'Combine the lime juice with the turmeric and cracked peppercorns. Coat the crab claws in the spiced juice and leave on one side.',
    'Heat the oil in a wok or karahi and add the mustard seeds — they should start popping almost straight away. Toss in the curry leaves and cinnamon stick. After about 30 seconds, once all the spluttering has settled down, add the sliced onion. Turn down the heat, cover the pan and soften the onions for about 5 minutes.',
    'Stir in the chillies, garlic and ginger and cook for a further minute before adding the ground cumin, chilli powder and ground fennel. Stir to mix everything together, then tip in the tomatoes. Fry this masala until the tomatoes have cooked down and most of the liquid has evaporated.',
    'Add the crab claws to the pan along with any spiced lime juice from the bowl. After a few seconds, add the mango cubes and sprinkle over the sugar. Turn the heat up high and continue frying for about 10 minutes or until the crab claws turn colour and the meat is tender. If the masala looks like it is catching on the bottom of the pan, add a dash of water now and again.',
    "You'll need a small hammer or a pair of crackers to break open the crab shells for eating — it's quite a messy affair, but great fun. Serve with flatbreads or rice."
  ],
  'plantain-curry': [
    'Put the unpeeled plantains in a steamer basket set over a pan of simmering water. Steam for about 10 minutes — they should still be quite firm to the touch.',
    'While the plantains are cooking, make the masala. Heat the oil in a karahi or wok and toss in the mustard seeds followed by the cumin seeds and curry leaves. As soon as the seeds pop and sizzle, tip in the onion, ginger and green chillies. Turn the heat down low, cover the pan and cook for about 10 minutes or until the onion is softened.',
    'When the plantains are done, peel them and grate or shred coarsely. Do this just before adding them to the onion mixture because they discolour really quickly.',
    'Add the turmeric to the masala while still on the heat and stir well to combine. Tip in the grated plantains and fry for a further 5–7 minutes, keeping an eye on them — you want them to keep some texture and bite. If it looks like it is sticking, add a dash of water.',
    'Sprinkle with the chopped coriander, sharpen with a squeeze of lemon and serve with boiled rice.'
  ],
  'bunny-chow': [
    'Lay the loaf flat and slice a 3cm (1¼in) layer horizontally off the top. Reserve the top. Pull out most of the crumb from the loaf, leaving 1cm (½in) thick sides on the bread case. Set aside.',
    'Heat the oil in a large saucepan and toss in the curry leaves. After about 10 seconds, turn the heat down low and stir in the onions, ginger and chillies. Cover the pan and cook for 10–15 minutes or until the onions are really soft. Uncover and continue frying the onions until they are tinged golden.',
    'Add the diced potato, cover the pan again and cook for about 10 minutes or until they are almost tender. Lift the lid every few minutes and give the potatoes a good stir to prevent them from sticking to the bottom of the pan.',
    'Tip in the tomatoes and garam masala and fry briskly until the tomatoes darken in colour and the masala thickens. Stir in the green beans and cook for 1 minute. Add the kidney beans along with the liquid from the cans. Stir well, then bring to the boil and simmer for about 10 minutes or until the curry thickens.',
    'Preheat the oven to 180°C (350°F/Gas 4).',
    'Sharpen the curried beans with the lemon juice and stir in the chopped coriander. Ladle the hot curry into the hollowed-out loaf, taking care to stop short of filling it right to the top. Replace the lid, pushing down well, so that the bread has a chance to soak in the masala. Wrap the loaf in foil and bake for 15 minutes.',
    'Bring the filled loaf, still wrapped in foil, to the table. Place on a big board and unwrap. Break open the four corners and tuck in — no cutlery needed!'
  ],
  'trinidadian-roti': [
    "First, make the green seasoning. Put all the green seasoning ingredients in a food processor or blender with 4 tbsp water and process until very finely chopped, almost puréed. (This makes more seasoning than is needed for the recipe, but the remainder can be kept in the fridge for up to 1 week. For keeping longer, substitute 1 tbsp cane or white vinegar for all the water.)",
    'Season the prawns with the garlic, half the onion and 4 tbsp of the green seasoning, tossing well. Set aside for 30 minutes.',
    'Mix the curry powder with 4 tbsp of water to make a paste. Heat the oil in a frying pan, add the remaining onion and cook for 6 minutes to soften. Add the curry paste and cook for 1 minute. Stir in the potatoes and cook over a low heat for 5 minutes.',
    'Add the prawns with the salt and chilli and stir for 1–2 minutes to coat the prawns with the curry mixture. Pour in 125ml (4fl oz) water and cook on a high heat for 3–5 minutes or until the prawns have turned pink and are cooked through. Do not overcook, or the prawns will become tough. Stir in the chandon beni or coriander and serve hot, wrapped in the roti.'
  ],
  'leilas-guyanese-chicken-curry': [
    'To make the curry powder, roast and grind all the spices. Mix 2 tbsp of the curry powder with the turmeric and curry paste. Add 2 tbsp water and mix well.',
    'Heat the oil in a large heavy-based saucepan and fry the chopped onion, garlic, ginger and chillies until golden brown. Add the curry mixture and fry for 3–5 minutes, stirring constantly to ensure that the mixture does not burn.',
    'Add the chicken pieces to the saucepan and turn them so that they are thoroughly coated with the spice mixture.',
    'Add the tomatoes and curry leaves and cook for 1 minute, then add the potatoes and 125ml (4fl oz) water. Cover the saucepan and simmer for 20 minutes or until the chicken is cooked. Stir the curry occasionally during the cooking, to make sure that it does not stick to the pan. Serve immediately with rice or roti.'
  ],
  'chicken-tikka-masala': [
    'Cut the chicken thighs into 3cm (1¼in) chunks. Combine the lime juice and paprika and mix with the chicken. Leave on one side while you roast and grind the cumin and coriander seeds.',
    'Put the shallots, garlic, ginger and chillies into a food processor. Drain the lime juice and paprika mixture from the chicken and add to the onion mixture. Process until smooth. Tip into a mixing bowl and stir in the yogurt, garam masala and add half the coriander and cumin powder.',
    "Pour the spiced yogurt mixture over the chicken, turning every piece so that it's evenly coated. Cover with cling film and marinate overnight in the fridge. If you can, flip the chicken over once or twice while it's marinating.",
    'Preheat the grill, with the grill pan in place, to its hottest setting.',
    'Take the chicken out of the yogurt marinade and arrange on the hot grill pan. Drizzle with the oil and grill for about 5 minutes on each side or until beginning to char around the edges. Pour any cooking juices into a bowl and skim off any fat. Keep the chicken warm while you make the sauce.',
    'Combine the tomatoes, tomato purée, coriander leaves, ginger, lime juice, sugar and remaining cumin and coriander powder in a blender or food processor and process until smooth. Heat the butter in a saucepan and, when melted, add the spiced tomato mixture and cream. Bring to simmering point, then strain in the reserved cooking juices and add the cooked chicken pieces. Reheat and serve piping hot, with Indian breads.'
  ],
  'prawn-balti': [
    'Put the prawns in a bowl, squeeze over the lime juice and stir in the paprika. Stir well, then leave on one side while you make the masala.',
    'Heat the oil in a karahi or wok set over a moderate heat and fry the onion for about 5 minutes or until softened and just beginning to turn golden. Add three-quarters of the ginger, followed by the garlic, chillies and shredded red pepper. Continue frying for 1 minute.',
    'Turn the heat up and add the tomatoes, turmeric, chilli powder, cinnamon, garam masala, ground coriander and sugar. Cook briskly until the tomatoes have thickened and darkened in appearance. Pour in about 150ml (5fl oz) hot water, stir well and turn the heat down low.',
    'Add the prawns, along with any lime juice from the bowl, and simmer for 3–4 minutes or until they turn pink and are tender.',
    'Garnish with chopped coriander and the remaining shredded ginger before serving.'
  ],
  'laal-maas': [
    'Set aside 3 or 4 of the dried chillies to use later; put the remainder to soak in 125ml (4fl oz) water. Also put aside 4–6 of the cloves and 1 tbsp of the ghee.',
    'Mix the yogurt with the cumin seeds, ground coriander, chilli powder and salt in a bowl. Set aside.',
    'Heat the rest of the ghee in a heavy-bottomed pan. Add the remaining cloves, the cinnamon leaves and the green and black cardamoms. When they begin to crackle and change colour, add the garlic. Sauté for 2 minutes or until the garlic begins to turn golden. Add the onions and cook for 10 minutes or until golden brown, stirring constantly.',
    'Stir in the meat and cook for 2–3 minutes. Drain the soaked red chillies and add to the pan. Continue cooking for 10–12 minutes or until the liquid has evaporated and the meat starts to brown slightly. Now add the spiced yogurt and cook for another 10–12 minutes or until the liquid from the yogurt has evaporated.',
    'Add the stock or water and bring to the boil, then cover the pan, reduce the heat and simmer until the meat is tender. Check the seasoning. Remove from the heat and keep warm.',
    'To prepare the tadka, or tempering, which boosts the flavours, heat up the reserved ghee or oil in a large ladle over a flame (or in a small pan) and add the reserved cloves and dried red chillies. Cook for 1–2 minutes or until the ghee changes colour and the spice flavours are released. Pour the contents of the ladle over the lamb curry, sprinkle with the chopped coriander and serve.'
  ],
  'subz-saag-gosht': [
    'Heat the ghee or oil in a heavy pot and add the cumin seeds and cloves. When they crackle, add the onions and sauté until they become light golden in colour. Add the garlic and ginger and sauté for a further 2–3 minutes or until the garlic begins to change colour.',
    'Sprinkle in the red chilli powder, turmeric and salt and stir for another couple of minutes until the spices begin to release their aromas and the fat starts to separate out. Now add the cubes of lamb and cook for 5–6 minutes, stirring constantly, until the lamb begins to brown around the edges.',
    'When most of the liquid has evaporated and the lamb is getting browned, add the green chillies, turnips and carrots and stir. Pour in the lamb stock. Reduce the heat to low, cover with a lid and cook until the lamb is three-quarters done.',
    'Remove the lid, add the tomatoes and cook for a further 10–12 minutes or until the lamb is nearly cooked and the tomatoes are incorporated with the masala. Stir in the spinach and increase the heat again. Cook for 2–3 minutes. (You can cover with a lid if you wish, to speed up the cooking of the spinach.)',
    'The lamb and spinach should be cooked by now, so check for seasoning and correct if required. To finish the dish, sprinkle with the ground mixed spices and dill, then cover the pan with the lid and remove from the heat.',
    'Remove the lid from the pan at the table and serve immediately, with chapatti or tandoori roti.'
  ],
  'dahi-wali-machli': [
    'Turn on the oven to low before you begin to cook. Place the fish in a large bowl and rub with the salt, lemon juice and turmeric. Set aside to marinate for 20 minutes.',
    'Sprinkle the fish with the chilli powder, carom seeds and chickpea flour. Using your hands, mix and rub well to ensure all the cubes of fish are coated with the mixture.',
    'Heat oil in a deep saucepan. When hot, add the fish and deep fry for 2–3 minutes or until golden brown. Drain on kitchen paper, transfer to an ovenproof dish and place in the oven to keep warm while you make the sauce.',
    'Heat the ghee in a saucepan, add the chopped onion and sauté until golden brown. Add the cumin, turmeric, chilli powder and salt and sauté until the spices begin to release their flavour. Stir in the ginger and green chillies and cook for a further 2 minutes.',
    'Whisk the yogurt and chickpea flour together in a bowl, making sure there are no lumps. Slowly add the yogurt mixture to the pan, stirring constantly to prevent the yogurt from splitting. When all the yogurt has been incorporated, increase the heat and bring to the boil. Pour in the stock and bring back to the boil, then simmer for 3–5 minutes.',
    'Add the pieces of fried fish and continue to cook over a low heat for another few minutes. Check the seasoning, then stir in the fenugreek and garam masala. Cover with a lid to retain the aromas of fenugreek and spices and remove from the heat. Serve immediately, with steamed rice.'
  ],
  'mtuzi-wa-samaki': [
    'Combine the lime juice with the cracked peppercorns and pour over the fish. Heat the oil in a deep-sided frying pan. Pat the fish dry with kitchen paper, then fry for about 1 minute on each side until lightly coloured but not quite cooked through. Using a slotted spoon, transfer the fish to a plate, cover with foil and leave on one side while you make the masala.',
    'To make the spice mixture, roast the chillies and seeds, then grind to a powder. Combine with the turmeric. Leave on one side.',
    'Add the red onion to the pan you used for frying the fish. Cover and cook for about 5 minutes or until softened. If the onion looks like it is catching on the bottom of the pan, add a dash of water. Tip in the red pepper, chilli and garlic, and continue frying, uncovered, for 10 minutes or until the onions are on the verge of turning colour. Stir in the spice mixture and fry briskly for 1 minute.',
    "Pour in the coconut milk and add enough tamarind water to lend a pleasant tang. The curry shouldn't be too thick — aim for something almost broth-like in consistency.",
    'Stir in the chopped tomatoes and bring to the boil, then pour in 200ml (7fl oz) water. Simmer the curry for about 15 minutes or until thickened.',
    'Return the fish to the pan and simmer for 5–10 minutes or until cooked through. Serve hot.'
  ],
  'bobotie': [
    'Tear the bread into rough pieces, place in a small bowl and pour over the milk. Leave on one side for about 10 minutes.',
    'Meanwhile, heat the oil in a flameproof casserole and, when hot, add the butter. Tip in the onions and chillies and cook until golden. Add the garlic and minced lamb and continue frying, stirring frequently, until the meat browns. Sprinkle over the curry powder, ground cinnamon, peppercorns and lemon zest. Stir and fry over a moderate heat for a further 5 minutes to cook the spices.',
    'Preheat the oven to 180°C (350°F/Gas 4).',
    'Squeeze excess milk from the soaked bread, then add the bread to the mince. Stir well to break up any lumps. Add the lemon juice, chutney, sugar and almonds. Remove from the heat and leave to cool before turning the meat mixture into a 1 litre (2 pint) pie dish. Roll the lemon or bay leaves into cigar shapes and stand them upright in the spiced meat. They should peep through the lamb.',
    'Whisk together the eggs, cream and milk and stir in the peppercorns. Pour this savoury custard over the mince and sprinkle with grated nutmeg. Set the pie dish in a roasting tin half filled with hot water. Bake for about 25 minutes or until the topping is golden and set.',
    'Serve with boiled rice or baked sweet potatoes. Bobotie also works well with a crisp salad and some tangy chutney.'
  ],
  'doubles': [
    'Drain the chickpeas, then put them in a pan of fresh salted water. Bring to the boil and boil for 15–20 minutes or until they are tender. Drain well.',
    'Heat the oil in a large frying pan, add the onion and garlic and cook for a few minutes until golden. Stir in the curry powder and pour in 4 tbsp water. Cook for another few minutes. Stir in the chickpeas and cook for a further 5 minutes. Pour in 250ml (8fl oz) of water and season with the cumin, salt and chilli. Bring to the boil, then reduce the heat to low, cover and cook for 15 minutes or until the chickpeas are soft and juicy, adding more water if necessary. Keep warm while you make the bara (or reheat for serving).',
    'Mix the flour, yeast, sugar, salt, turmeric, cumin and margarine together in a bowl. Add about 250ml (8fl oz) warm water to make a soft dough. Knead for a few minutes, then return to the bowl. Cover and set aside for 15 minutes.',
    'Form the dough into 24 balls. On an oiled work surface, using your fingertips, pat each ball flat into a thin pancake about 8cm in diameter.',
    'Heat the oil for deep-frying in a deep-sided frying pan. When the oil is hot, fry the bara one at a time: add to the oil and fry for just 5–7 seconds or until the dough starts to bubble, then turn over and fry for another 5–7 seconds. Remove with a slotted spoon and drain on kitchen paper. Keep warm in a low oven while you fry the remaining bara.',
    'Serve by making a sandwich: place 2 tbsp of curried chickpeas between a pair of bara, adding some chandon beni plus hot pepper sauce and/or mango chutney to taste.'
  ],
  'jamaican-goat-curry': [
    'Ask the butcher to cut up the bones for you. Season the cubes of meat with the chives, chopped chilli, half the garlic, the allspice, half the thyme and 2 tbsp of the curry powder. Cover and marinate for at least 4 hours, preferably overnight.',
    'Heat the oil in a large flameproof casserole, or dutchie, and add the remaining garlic and thyme, the onions and ginger. Cook for about 5 minutes or until the onions start to turn golden.',
    'Mix the remaining curry powder with 4 tbsp of water. Add to the pot and cook, stirring, until all the liquid has evaporated. Add the cubes of goat meat and cook over a low heat for 5 minutes or until the meat is seared all over, stirring constantly to prevent it from sticking to the pot.',
    'Add the bones, salt and whole chilli, then pour over the coconut milk and 250ml (8fl oz) water. Bring up to the boil. Reduce the heat to low, cover and simmer for 2 hours.',
    'Remove the lid and continue cooking for about 30 minutes or until the meat is soft and tender and the sauce is thick and glossy. Serve hot.'
  ],
  'chicken-korma': [
    'For the browned onion paste, sprinkle the sliced onion with salt and set aside for 20 minutes. Pat the onion dry with kitchen paper. Heat vegetable oil in a deep-fryer or wok and fry the onion slices until golden. Drain on kitchen paper. Transfer the warm fried onion to a food processor. Add 2 tbsp hot water and process until smooth. Leave on one side.',
    'For the nut paste, soak the cashew nuts and almonds in boiling water, covered, for 30 minutes. Drain the nuts, reserving 2–3 tbsp of the liquid. Grind the nuts to a paste in a food processor, helping them along their way with a dash of the soaking liquid.',
    'Put the saffron threads in a small bowl and cover with 2 tbsp hot water. Leave to soak for at least 10 minutes. Meanwhile, heat the oil in a karahi or wok and add the ghee. Once melted, stir in the mace, cloves, cardamom pods and cinnamon stick. Swirl the spices around for about 30 seconds.',
    'When you catch a warm nutty aroma, add the chopped onion. Turn the heat down low and cook for about 5 minutes or until the onion is soft but not coloured.',
    'While the onion is cooking, put the ginger and garlic in a food processor and add 2 tbsp water. Blend to a smooth paste. Add this paste to the onions and fry, stirring well, for a further 1 minute. Stir in the nut paste and continue cooking, stirring all the time, for 2–3 minutes or until most of the liquid has evaporated.',
    'Add the chicken pieces to the pan along with the chilli powder, ground coriander and garam masala. Combine everything and fry for 5 minutes to cook the spices. Pour over about 125ml (4fl oz) water and turn the heat down low. Cover the pan and simmer for 10 minutes or until the chicken is cooked, stirring occasionally. If the curry looks like it is catching on the bottom of the pan, add a dash more water.',
    'Add the browned onion paste and stir to combine. Pour the coconut milk and cream over the curry. Bring to a simmer, then add the saffron and its soaking liquid. Scatter over the chopped coriander and serve piping hot with naans.'
  ],
  'nalli-gosht': [
    'First blanch the lamb shanks: place them in a large saucepan of boiling water, cover and cook for 20 minutes. Drain. When cool enough to handle, cut away all the gristle from the meat.',
    'Heat the oil in a pan large enough to hold the shanks. Add the cardamoms and cinnamon sticks and, when they crackle, add the onions. Cook until golden brown. Add the ginger and garlic pastes and cook for 2 minutes, stirring constantly. Add the ground spices and cook for 3 more minutes.',
    'Slowly whisk in the yogurt and stir until the sauce reaches simmering point. Stir in the fresh tomato purée and bring the sauce to the boil. Season with the salt.',
    'Add the lamb shanks to the simmering sauce. Cover with a tight-fitting lid and cook over a low heat for 1½–2 hours or until the lamb is very tender and the meat is almost falling off the bone. Add some stock from time to time: you will need the extra liquid to cook the shanks completely.',
    'Alternatively, you can cook the lamb shanks in the oven. Put them in a braising tray, cover with the sauce and stock, and braise in a preheated 180°C (350°F/Gas 4) oven for 2½–3 hours. Keep checking the shanks after 2 hours.',
    'Remove the shanks and arrange them on a serving tray or plate. Cover and keep warm in a low oven while you finish the sauce.',
    'Skim any excess fat or oil from the sauce, then strain the sauce into a smaller saucepan and return to the heat. Add the garam masala powder, saffron and rose water, if you have any. Bring to the boil again, check the seasoning and stir in the cream. Remove the shanks from the oven and pour over the sauce. Serve immediately.'
  ],
  'banh-mi': [
    'Put the yeast in a small bowl and add the lukewarm water. Stir until dissolved.',
    'Sift the flours and salt into a large mixing bowl. Make a well in the centre and add the yeast liquid. With a wooden spoon incorporate the wet and dry ingredients until fully combined. The dough should be soft, not wet, and definitely not stiff.',
    'Turn the soft dough on to a floured work surface and knead for about 5 minutes or until smooth and elastic. Shape into a ball. Grease a large mixing bowl and place the dough ball in it. Cover with cling film and leave to rise at warm room temperature for 3 hours or until doubled in size.',
    'Knock back the dough, bringing the sides towards the centre. Turn out the dough on to a floured work surface and knead for 2 minutes, then shape into a ball once again. Divide the dough into 4 equal pieces. Make sure they are separated by 5cm (2in) or so, then cover them with cling film and leave to rise at warm room temperature for 2 hours or until doubled in size.',
    'Knock back each piece of dough, rolling and pulling it (against the work surface) back into a ball. Stretch each ball roughly into a 1cm (½in) thick rectangle, then roll into a slender, almond-shaped loaf with tapered ends. Cover with cling film and leave to rise at warm room temperature for 1 hour or until almost doubled in size.',
    'Remove all but one rack from your oven. Place the rack at the bottom and set a pizza stone on it. Preheat the oven to 230°C (450°F/Gas 8).',
    'Sprinkle a peel or baking sheet with flour and place 1 or 2 shaped breads on it. Score each bread 3 times on the diagonal using a clean razor blade or sharp knife. Slide the breads on to the hot stone and bake for 20–25 minutes or until golden. Transfer the loaves to a wire rack and leave to cool for 1–2 hours before eating.'
  ],
  'madras-curry': [
    'To make the spice blend, roast and grind the spices. Leave on one side. For the coconut paste, combine all the ingredients in a food processor and process until smooth. You might need to add a dash of water to help it along its way.',
    'Heat the oil in a large flameproof casserole and fry the onions until golden. Stir in the tomatoes, tomato purée and dry spice mixture. Cook briskly, stirring frequently, for about 10 minutes or until the sauce has thickened.',
    'Add the meat to the pan and fry over a high heat until it starts to colour. While the meat is cooking, gradually add the spiced coconut paste. Turn the heat down low and pour over enough hot water to reach three-quarters of the way up the meat. Cover the pan and simmer for about 30 minutes or until the lamb is tender.',
    'Just before serving, add the coconut milk and gently reheat the curry, stirring frequently. Serve with rice or Indian breads.'
  ],
  'rogan-josh': [
    'To make the spice mix, combine all the ingredients. Leave on one side.',
    'Put the onion in a food processor, add a dash of water and blend to a smooth paste. Tip the onion paste into a small bowl. Alternatively, you can grate the onion. Blend the garlic in the food processor with 1 tbsp water, then transfer to another bowl.',
    'Heat the oil in a wok or karahi over a moderate heat and add the brown and green cardamoms, cinnamon sticks, bay leaf, cloves, peppercorns and mace. Swirl everything around in the hot oil for about 30 seconds or so, until the spices give off a nutty whiff.',
    'Add the onion paste to the pan, turn down the heat and fry until golden. Stir in the garlic paste and continue cooking for 1 minute.',
    'Tip the lamb into the pan, turn the heat up and fry for about 10 minutes or until browned. If it looks like it is catching on the bottom of the pan, add a couple of tablespoons of water. Stir in the spice mixture.',
    'Gradually add the yogurt to the pan, stirring well between each addition. Pour in enough hot water to barely cover the lamb, then cover the pan and simmer, stirring occasionally, for about 40 minutes or until the lamb is tender and the sauce thickened.',
    'If, at the end of cooking, the masala is a little thin, take the lamb out of the pan and boil the liquid until thickened. Return the meat to the curry and serve piping hot.'
  ],
  'curry-nanban-soba': [
    'First make the curry roux. Heat the oil in a saucepan and fry the onion, garlic and ginger over a low heat for 20–30 minutes or until golden. Add the flour and curry powder and stir until the oil in the pan has been absorbed. Add the ketchup and chutney, mixing thoroughly. Remove from the heat and set aside.',
    'To make the soup, pour the dashi stock into a large pan and bring to the boil. Add the chicken and onion and simmer for 5 minutes, skimming off any scum from the surface. Reduce the heat to low.',
    'Scoop out about 500ml (16fl oz) of stock and mix little by little into the curry roux to make a smooth, thick paste. Pour the roux mixture into the rest of the stock in the large pan, then add the shoyu and mirin. Mix thoroughly. Bring to the boil, then reduce the heat and leave to simmer gently while you cook the soba.',
    'Bring a large pan of water to the boil. Add the soba and cook for about 5 minutes or as instructed on the package. As with Italian pasta, soba should be cooked al dente and eaten as swiftly as possible. Drain the soba, then pop it into the soup. Mix well.',
    'Ladle the soup into 4 deep soup bowls. Sprinkle with the spring onion and garnish with the mange tout. Serve immediately.'
  ],
  'katsu-curry': [
    'To make the curry roux, heat the oil and butter in a frying pan, add the onion and reduce the heat to low. Fry for 30–40 minutes or until the onion is soft and brown. Stir in the garlic, ginger and curry powder and fry for 2 minutes. Add the flour and stir to absorb the oil. Add the chutney, ketchup and shoyu and mix well. Remove from the heat and set aside.',
    'Next make the curry sauce. Heat the oil in another frying pan and fry the onion for 3 minutes. Add the mushrooms and fry until soft. Add the apple, carrot and celery and fry for 5 minutes over a moderately low heat. Pour in the stock and bring to the boil. Stir in the curry roux little by little and add salt and pepper to taste. Cover and leave to simmer gently, stirring occasionally.',
    'With a sharp knife, make shallow cuts around the edge of the pork steaks to prevent them from curling up when fried. Season the steaks. Dust lightly with flour, then dip in beaten egg and coat with breadcrumbs, patting them on well.',
    'Heat oil for deep-frying to 160°C (325°F). Fry the pork steaks for about 3 minutes per side or until the breadcrumbs are golden brown and the meat is thoroughly cooked. Drain on kitchen paper, then cut the meat into strips about 2cm (¾in) wide. Make a bed of rice on each plate and arrange the pork on top. Spoon over the hot curry sauce and serve immediately.'
  ],
  'garam-masala': [
    'Heat a dry frying pan and add all the spices. Stir them and shake the pan as they start to crackle. When they smell roasted and aromatic, remove the pan from the heat and tip the spices on to a plate. Allow to cool.',
    'To grind the spices, use a mortar and pestle or a spice mill (or a clean coffee grinder).'
  ],
  'achari-khargosh': [
    'Place the rabbit legs in a pan and add the salt and turmeric. Pour in 1.5 litres (2¾ pints) water and bring to the boil over a moderate heat. Reduce the heat to low, cover with a lid and simmer for 45 minutes or until tender. Remove the rabbit legs from the liquid and drain; reserve the cooking liquid.',
    'In another heavy-bottomed pan, heat the mustard oil to smoking point over a moderate heat. Add the ghee and, as it melts, add the whole red chillies and allow them to crackle for a few seconds. Next add the pickling spices and, as they begin to crackle and change colour, add the garlic. Sauté the garlic for a minute or so until golden brown, then add the onions. Sauté for 10 minutes or until the onions are soft and translucent but not brown.',
    'Stir in the salt and turmeric and add the cooked rabbit legs. Add the ginger and palm sugar and stir for a few minutes, until the legs start to acquire a light brown colour. Now stir in the reserved cooking liquid and let it simmer for 5 minutes.',
    'In a bowl whisk the yogurt with the chickpea flour until well combined. Increase the heat and bring the liquid in the pan back to the boil. Slowly add the yogurt mixture, stirring constantly to prevent it from splitting. When all the yogurt has been incorporated, continue simmering for 2–3 minutes. If the oil starts to separate out at the sides of the pan, that\'s fine.',
    'Check the seasoning and, just before serving, stir in the lemon juice and coriander. Serve with either rice or bread.'
  ],
  'panchmael-daal': [
    'Mix all the lentils together, then wash under running water. Leave to soak in cold water to cover for about 20 minutes.',
    'Put the lentils in a saucepan with 600ml (1 pint) water, 1 tsp salt and half of the turmeric. Bring to the boil, skimming off the white scum from the surface whenever necessary. Cover and simmer on a low heat for 20–25 minutes or until all the lentils, except for the chana dal, are very soft and broken down.',
    'Meanwhile, heat the ghee in a frying pan and, when hot, add the onion and cook until golden brown. Add the remaining salt and turmeric, the chilli powder and garam masala and sauté for a minute, then add the tomato and cook until soft.',
    'Pour the onion and tomato mixture over the lentils and bring to the boil. If the lentils begin to thicken too much, add some boiling water and keep stirring, to ensure that they don\'t stick to the pan. Finish with the fresh coriander and lemon juice. Remove from the heat and keep hot.',
    'For the tadka, or tempering, heat the ghee in a large ladle (or small pan) until smoking. Add the whole red chilli, cumin seeds, cloves and garlic, in that order and in quick succession as the garlic begins to turn golden, then pour the contents of the ladle over the lentils and cover the pan with a lid. Leave covered for 2 minutes, to let the smoke and flavours be absorbed by the lentils. Remove the lid, stir well and serve immediately.'
  ],
  'lahsun-ki-chutney': [
    'Heat the oil in a saucepan, add the cumin seeds and, when they crackle, add the garlic. Fry until it begins to turn golden.',
    'Add the chilli paste, vinegar, salt and chilli powder. Cook, stirring constantly, for 5–6 minutes. Add the kachri if you have some and cook the chutney for a further 12–15 minutes or until the fat separates out and comes to the top.',
    'Check the seasoning and add the sugar, if required. Remove from the heat and allow to cool. This chutney can be eaten cold or hot. If you decide to heat it up before serving, add the fresh coriander to liven it up.'
  ],
  'missi-roti': [
    'Mix together the chickpea flour and plain flour in a large bowl. Transfer 3–4 tbsp of the flour mix to a small bowl and set aside to use later if needed. Add the salt, ginger, green chillies, chopped coriander, carom seeds, red chilli powder and turmeric to the large bowl and mix well to combine with the flours.',
    'Add the oil and 200ml (7fl oz) water and knead to obtain a stiff dough. If the dough feels slightly soft add some of the reserved flour. Gather the dough into a mound, cover with a damp kitchen cloth and keep aside for 15–20 minutes.',
    'Divide the dough into 8 pieces and shape into balls. Top each of the balls with chopped red onion and spring onion, then roll out using a rolling pin into a round 15–20cm (6–8in) in diameter.',
    'Place a large frying pan over a low to moderate heat. When hot, cook the breads on the dry pan, one at a time, for 3–4 minutes on each side or until they start to dry out and colour.',
    'When both sides are done, brush with some melted ghee and turn the bread over, then brush the other side with melted ghee. Serve the breads hot.'
  ],
  'kadhai-paneer': [
    'To make the sauce, heat the ghee in a pan, add the garlic and let it colour. Stir, then add the coriander seeds and red chillies. When they release their aromas, add the onions and cook until they start changing to light golden. Stir in the ginger, green chillies and tomatoes. Reduce the heat to low and cook until all excess moisture has evaporated and the fat starts to separate out. Add the salt, garam masala and fenugreek leaves and stir. Taste and add some sugar, if needed.',
    'For the stir-fry, heat the ghee in a kadhai, wok or large frying pan. Add the crushed chillies, pepper strips and red onion. Stir and sauté on a high heat for under a minute, then add the paneer and stir for another minute. Add the sauce and mix well. Once everything is heated through, check for seasoning, adding a touch of salt if required. Finish with the fresh coriander, fenugreek leaves and lemon juice. Garnish with the ginger and serve with naan.'
  ],
  'daal-makhani': [
    'Drain the lentils and transfer them to a saucepan. Pour over 1.5 litres (2¾ pints) water and bring to the boil. Simmer for about 1 hour or until the lentils are thoroughly cooked but are not completely broken down and mashed.',
    'Add the ginger and garlic pastes, salt and red chilli powder and simmer for a further 10 minutes. Reduce the heat to low and add the tomato purée and butter. Cook for 15 minutes or until the lentils are thick, stirring frequently. Take care that the emulsion does not split — that the butter does not separate from the lentils.',
    'Stir in the garam masala, fenugreek leaves and sugar, and check the seasoning. Finish with the cream and serve immediately.'
  ],
  'naan': [
    'Preheat the oven to 220°C (425°F/Gas 7). Place two non-stick baking trays in the oven to heat up. Alternatively, preheat your grill to maximum heat.',
    'Mix the sugar and eggs with the milk in a large jug, stirring until the sugar has dissolved. Put the flour in a large mixing bowl and mix in the baking powder and salt. Gradually pour the milk mixture into the flour, mixing with your hand, and knead lightly just to make a soft dough. Take care not to knead too much or the dough will become too stretchy. Cover the bowl with a damp cloth and leave to rest for 15 minutes.',
    'Add the oil and mix lightly to incorporate it into the dough. Divide the dough into 16 small pieces. Roll out each piece into a round about 10cm (4in) in diameter. To form into the traditional \'tear\' shape, lay a round over one palm and gently pull one edge down until it stretches a bit. Place the breads on the hot trays and bake for 4–5 minutes.',
    'If you are using the grill, heat a grill pan on the hob. When it\'s hot, place one naan bread on the pan and cook on the hob for a couple of minutes or until the bread starts to colour slightly and cook underneath. Transfer the pan to the grill and cook for a minute or so, until the bread puffs up and becomes slightly coloured on top. Serve warm (if not serving immediately, reheat in a 180°C/350°F/Gas 4 oven for 1–2 minutes).'
  ],
  'kachhi-mirch-ka-gosht': [
    'Wash the diced lamb in running cold water for 10 minutes to remove any blood. Dry using kitchen paper. Put the lamb in a bowl with the yogurt, peppercorns, roasted pounded coriander and cumin, and salt. Toss to mix, then set aside to marinate.',
    'Reserve 1 tbsp of the ghee for later use and heat the rest in a heavy-bottomed pot. Add the mace and black cardamoms and stir for a few seconds. Add the white onions and cook them over a moderate heat until soft and translucent but not brown. As they begin to turn slightly golden, add the ginger and 4 of the green chillies.',
    'Add the marinated lamb and stir. Cook for 12–15 minutes, stirring constantly, making sure that the lamb does not brown in the process. Pour in the stock, reduce the heat to low and cook, covered, until the lamb is almost done.',
    'Stir in the cashew nut paste and cook for a further 5–7 minutes. Add the cream and correct the seasoning, if required. Leave to simmer gently.',
    'In a separate pan, heat the remaining ghee and briskly sauté the red onion and the remaining green chillies until the onion is soft and translucent. Add to the simmering lamb, sprinkle with the mint and lemon juice, and stir in the fennel powder. Serve immediately, with paratha or pilau.'
  ],
  'subz-miloni': [
    'Parboil the carrots, cauliflower and green beans until al dente (3 minutes for the cauliflower and green beans, 4 minutes for the carrots). Drain well and refresh in iced water; drain again.',
    'Blanch the spinach in boiling salted water until wilted, then drain and cool quickly in iced water. Squeeze dry. Blend in a food processor to make a smooth paste, adding a little water as required.',
    'In a heavy-bottomed pan, heat the ghee over a moderate heat. Stir in the cumin seeds and, when they start to crackle, add the garlic and sauté until golden. Add the onion, reduce the heat to low and cook until soft and golden brown. Add the ginger and chillies and sauté for 2–3 minutes.',
    'Stir in the carrots and cauliflower and cook for 2–4 minutes. Add the coriander and salt, then the mushrooms and sauté, stirring, for 2–3 minutes or until they soften up. Add the baby corn and sauté for 1–2 minutes. Next add the broccoli, beans and peas. Mix together well. Add the chickpea flour and stir for 2–3 minutes, to cook off the flour. Add the spinach paste, then bring to the boil, stirring in the butter and cream.',
    'As soon as the vegetables are boiling, check for seasoning and correct if necessary. Finish with the fenugreek leaves and garam masala. Do not cook for too long after adding the spinach paste as it will discolour and render the dish unappetizing in appearance. Serve with paratha or chapatti.'
  ],
  'bateyr-masala': [
    'Clean the quails inside and out by washing under running cold water; drain and pat dry using kitchen paper. Season them by rubbing with a mixture of 1 tbsp of the ginger paste, 1 tbsp garlic paste, 1 tsp red chilli powder, ½ tsp turmeric and 1 tsp salt. Set aside to marinate for 10–15 minutes.',
    'Take a shallow but wide pot or pan that can hold the quails in it comfortably and which has a tight-fitting lid. Set it over a moderate heat and pour in the oil. When hot, place the quails in the pot, a few at a time, and cook until they are golden brown on all sides. Using a slotted spoon, transfer the quails to a dish and set aside.',
    'Heat the juices and oil left in the pot and add the whole spices, stirring to release their aromas. Add the onion paste and the remainder of the ginger and garlic pastes and cook, stirring constantly to prevent the pastes from sticking to the bottom of the pan. After 5–6 minutes add the remainder of the chilli powder, turmeric and salt and the ground coriander. Cook until the fat begins to separate out from the pastes.',
    'Return the seared quails to the pot and spoon the sauce over them carefully, taking care not to break the birds. Whisk the yogurt with the chickpea flour, then pour over the birds and mix into the sauce. Cover with the lid, reduce the heat to low and cook for 15–20 minutes.',
    'Remove the lid and transfer the quails to a serving dish; keep warm. Whisk the sauce for a few minutes using a hand whisk or fork to emulsify the mixture. It will still separate a little but should have a coating consistency. Taste and correct the seasoning if required and finish with the garam masala and fresh coriander. Spoon over the quails and serve immediately.'
  ],
  'gucchi-aur-murgh-kalia': [
    'Wash the morels thoroughly to get rid of any grit. Soak in 200ml (7fl oz) water for 30 minutes to rehydrate. Drain the morels, reserving the liquid, and pat dry with kitchen paper.',
    'While the morels are soaking, deep-fry the onions until golden. Drain, then blend with 50g (1¾oz) of the yogurt and a little water to make a paste.',
    'Heat 1 tbsp of the ghee in a heavy-bottomed pan and add ½ tsp of the royal cumin. When it crackles, add the morels and sauté for a couple of minutes over a moderate heat. Using a slotted spoon remove the morels from the pan and set aside.',
    'Heat the rest of the ghee in the pan and add the whole spices, together with the remaining royal cumin. Stir for 1–2 minutes, then add the chicken pieces. Sauté for 2–3 minutes on a high heat, then add the onion, ginger and garlic pastes and mix together. Stir for another 2–3 minutes. Add the red chilli powder and salt and cook for 2–3 minutes. Stir in the remaining yogurt, little by little. Cook for 5 minutes, then add the stock and the reserved morel soaking liquid. Reduce the heat, cover the pan and simmer gently until the chicken is cooked.',
    'Remove the chicken pieces with a slotted spoon and set aside. Pass the sauce through a sieve, then return to the pan and bring back to the boil. Boil until reduced to a sauce-like consistency.',
    'Reduce the heat to low and stir in the cream, saffron and garam masala. Add the chicken pieces and simmer briefly to heat up. Lastly, just before serving, add the morels and finish with the rose water, if using. Transfer to a shallow dish and garnish with the optional gold leaf.'
  ],
  'river-lime-curried-duck': [
    'Season the duck with the thyme leaves, ginger, garlic, onion, seasoning peppers, chandon beni and 1 tbsp curry powder. Allow to marinate overnight, if possible.',
    'Mix the remaining curry powder, the turmeric and cumin with 4 tbsp water. Heat the oil in a heavy frying pan, add the spice mixture and fry for 1–2 minutes or until browned. Add the duck and stir well to coat with the spices. Cook for 15 minutes to brown the duck on all sides.',
    'Add the coconut milk and bring to the boil. Lower the heat to a simmer and add the whole Scotch bonnet chilli. Cover and cook for about 1½ hours or until the duck is tender.',
    'Remove the lid and simmer for a further 10 minutes or until the liquid has reduced a little. Season with salt and pepper. Serve immediately, garnished with a few extra chopped chandon beni or coriander leaves. Serve with rice.'
  ],
  'makai-ka-soweta': [
    'Mix together the ingredients for the marinade. Add the cubes of lamb and turn to coat them, then cover and set aside for about 15 minutes.',
    'Meanwhile, make the onion paste by blending together the ingredients in a blender until smooth.',
    'Heat the ghee in a heavy-bottomed pan over a moderate heat, then add all the spices and the cinnamon or bay leaves. As the spices crackle, add the marinated cubes of lamb, with the marinade, and turn up the heat to high. Cook for 12–15 minutes or until all the moisture has evaporated, stirring constantly.',
    'Next add the onion paste and cook for a further 10 minutes, still stirring to ensure that the paste does not stick to the pan and burn. Pour over the lamb stock and reduce the heat. Simmer for 30 minutes or until the meat is about 85 per cent cooked.',
    'Add the sweetcorn and cook for another 10 minutes, stirring constantly. The dish is ready when the consistency is glossy. Remove from the heat, check the seasoning and transfer to a heated serving dish. Finish with the lemon juice and fresh coriander. Serve with steamed rice or bread.'
  ],
  'pitod-ka-saag': [
    'First make the dumplings. Whisk the yogurt and 500ml (16fl oz) water with the chickpea flour, salt, turmeric, sugar, garam masala and ginger in a bowl. Set aside.',
    'Heat the ghee in a heavy pan, add the fennel seeds and sauté briefly, then add the asafoetida and stir for 30 seconds. As the flavours are released, add the yogurt mix and cook, stirring constantly, for 20–25 minutes or until the mixture becomes thick and acquires the consistency of a soft dough. Remove from the heat and transfer to a greased 15cm (6in) square tray or tin. Chill in the fridge for about 30 minutes or until set like a cake.',
    'To make the sauce, heat the oil in a saucepan over a moderate heat and add the asafoetida, cumin and cloves. When they begin to crackle, add the onion and cook for 5–8 minutes or until soft.',
    'Meanwhile, whisk the yogurt with the ground coriander, turmeric, red chilli powder and salt. Add to the onions, stirring constantly, and keep stirring as the mixture comes to the boil again, to prevent the yogurt from splitting. Once boiling, add the green chillies and 200ml (7fl oz) water. Bring back to the boil, then cook for about 5 minutes. Check the seasoning and add salt and sugar to balance the taste, if required. Finish with the fresh ginger, coriander and lemon juice. Keep hot.',
    'Cut the dumpling cake into 2.5cm (1in) squares. Heat some oil in a frying pan and, when hot, add the dumplings, a few at a time. Fry for a couple of minutes, until the dumplings have a crust. Serve on top of the yogurt sauce.'
  ],
  'rezala': [
    'If cooking in the oven, preheat it to 180°C (350°F/Gas 4).',
    'Mix the meat with all the other ingredients (except the paratha dough) and set aside to marinate for 10–15 minutes.',
    'Transfer the marinated meat to an ovenproof earthenware casserole or flameproof pot with a tight-fitting lid. Seal the lid using paratha dough. If need be, place a weight on the lid to prevent steam from escaping during cooking.',
    'Put the casserole in the oven or the pot over a low flame. Cook for 2 hours or until the meat is tender. If cooking in the oven, reduce the heat to 110°C (230°F/Gas ¼) after 25–30 minutes.',
    'Stir the sauce, then finish by adding the cream and cashew nut paste. Bring back to the boil. Taste and correct the seasoning, if required. Sprinkle with the chopped coriander and mint, and serve.'
  ]
}

const DESCRIPTION_OVERRIDES = {
  'cari-chay': 'Tofu, which originated in China millennia ago, came into Vietnamese cuisine during China\'s thousand-year rule of Vietnam, from 100 BCE to 1000 CE approximately. Today, with the high cost of meat (usually reserved for special occasions and holidays) and the religious preferences of vegetarian Buddhism, tofu still plays an important role in the country\'s cooking. Cari Chay combines tofu, bamboo and Asian aubergine in a relatively light dish suitable for any season. It is subtle with a light coconut milk broth spiced with curry powder. The last-minute addition of Vietnamese coriander lends a floral finish. Serve with rice or baguette.',
  'river-lime-curried-duck': "As you drive through the countryside in Trinidad you will often see groups of Indo-Caribbean people gathered on a river bank, relaxing, enjoying each other's company, drinking icy-cold Carib beer and generally having a good time. This is what is known as a 'river lime', and curried duck is one of the dishes often cooked in a 'dutchie' over an open fire by the river. Dutchie is a local term for a 'Dutch pot', which arrived in the Caribbean islands in the mid 1600s from the Netherlands, brought by the early explorers who used these cooking vessels on their expeditions into the interior. Made from aluminium scraps and river sand, the dutchie (also called a 'coal pot') is still used all over the Caribbean.",
  'dahi-wali-machli': 'The north of India is not known for its fish dishes, but every region seems to have at least one standard recipe. Most of the fish used in northern India are river fish or are caught from lakes or ponds. Local fish include rohu or katla but elsewhere can be replaced by perch, barramundi or prized varieties like halibut or monkfish.',
  'bobotie': 'Brought to South Africa by Southeast Asian slaves in the 17th century, Bobotie is a tribute to Cape Malay cooking styles and Islamic culinary influences. Boer settlers used to bake their interpretation of Bobotie inside a hollowed-out pumpkin. Today, it\'s usually baked in a round pot, with most cooks adding their own special twist — perhaps a handful of raisins or dried apricots, or more chillies for added strength.',
  'doubles': 'Doubles consists of two delicate pancake-type breads called bara filled with lightly curried chickpeas (channa), served with hot pepper sauce and mango chutney. My favourite Doubles vendor is George, who is located just outside the Brooklyn Bar in Port of Spain.',
  'nalli-gosht': 'This is a very simple dish to make but is a great indicator of the level of finesse and sophistication in cooking that was reached during the reign of certain Mughal rulers in Lucknow. Slow cooking allows for maximum extraction of gelatine from the shanks, giving a shine and smoothness to the sauce that is unique.'
}

/** Full ingredient list replacements where OCR parsing fails */
const INGREDIENT_OVERRIDES = {
  'rau-muong-xao': [
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'large, chopped' },
    { ingredientName: 'water spinach', amount: '450', unit: 'grams', notes: '' },
    { ingredientName: 'fish sauce', amount: '1', unit: 'tbsp', notes: 'or 1 tbsp fermented bean curd (1–2 cubes)' },
    { ingredientName: 'sugar', amount: '', unit: 'pieces', notes: 'pinch' },
    { ingredientName: 'pepper', amount: '', unit: 'pieces', notes: 'to taste' }
  ],
  'doubles': [
    { ingredientName: 'dried chickpeas', amount: '250', unit: 'grams', notes: 'soaked overnight' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: 'for chickpeas' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'mild curry powder', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'ground cumin', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'Scotch bonnet chilli or hot pepper sauce', amount: '¼', unit: 'tsp', notes: 'chopped, optional' },
    { ingredientName: 'chandon beni or coriander leaves', amount: '', unit: 'pieces', notes: 'chopped' },
    { ingredientName: 'plain flour', amount: '350', unit: 'grams', notes: 'for bara' },
    { ingredientName: 'instant yeast', amount: '1½', unit: 'tsp', notes: 'for bara' },
    { ingredientName: 'caster sugar', amount: '½', unit: 'tsp', notes: 'for bara' },
    { ingredientName: 'salt', amount: '½', unit: 'tsp', notes: 'for bara' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: 'for bara' },
    { ingredientName: 'ground cumin', amount: '½', unit: 'tsp', notes: 'for bara' },
    { ingredientName: 'melted margarine', amount: '2', unit: 'tbsp', notes: 'for bara' },
    { ingredientName: 'vegetable oil', amount: '250', unit: 'ml', notes: 'for deep-frying bara' }
  ],
  'jamaican-goat-curry': [
    { ingredientName: 'leg of goat', amount: '2', unit: 'kg', notes: 'boned, bones reserved, cut into 2.5cm cubes' },
    { ingredientName: 'chives', amount: '2', unit: 'tbsp', notes: 'finely chopped' },
    { ingredientName: 'Scotch bonnet chillies', amount: '2', unit: 'pieces', notes: '1 deseeded and chopped, 1 left whole' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'ground allspice', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'thyme', amount: '1', unit: 'pieces', notes: 'small bunch, leaves chopped' },
    { ingredientName: 'Caribbean curry powder', amount: '4', unit: 'tbsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'fresh root ginger', amount: '1', unit: 'tbsp', notes: 'grated' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'coconut milk', amount: '400', unit: 'ml', notes: '' }
  ],

  'banh-mi': [
    { ingredientName: 'fresh yeast', amount: '15', unit: 'grams', notes: '' },
    { ingredientName: 'lukewarm water', amount: '350', unit: 'ml', notes: '' },
    { ingredientName: 'rice flour', amount: '140', unit: 'grams', notes: '' },
    { ingredientName: 'white bread flour', amount: '350', unit: 'grams', notes: 'plus extra for kneading' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' }
  ],
  'crab-and-mango-curry': [
    { ingredientName: 'lime juice', amount: '', unit: 'pieces', notes: 'juice of 1 lime' },
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: '' },
    { ingredientName: 'cracked black peppercorns', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'uncooked crab claws', amount: '8', unit: 'pieces', notes: '' },
    { ingredientName: 'mango', amount: '1', unit: 'pieces', notes: 'firm, slightly under-ripe, cut into 2cm cubes' },
    { ingredientName: 'palm sugar or muscovado sugar', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '4', unit: 'tbsp', notes: 'for masala' },
    { ingredientName: 'mustard seeds', amount: '¾', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'curry leaves', amount: '2', unit: 'pieces', notes: 'sprigs, about 2 tbsp leaves (for masala)' },
    { ingredientName: 'cinnamon stick', amount: '4', unit: 'cm', notes: 'for masala' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, sliced (for masala)' },
    { ingredientName: 'red chillies', amount: '2', unit: 'pieces', notes: 'deseeded and chopped (for masala)' },
    { ingredientName: 'garlic cloves', amount: '3', unit: 'pieces', notes: 'finely chopped (for masala)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for masala)' },
    { ingredientName: 'ground cumin', amount: '½', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'chilli powder', amount: '½', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'fennel seeds', amount: '1', unit: 'tsp', notes: 'roasted and ground (for masala)' },
    { ingredientName: 'plum tomatoes', amount: '4', unit: 'pieces', notes: 'large, skinned and finely chopped (for masala)' }
  ],
  'trinidadian-roti': [
    { ingredientName: 'raw medium-sized prawns', amount: '900', unit: 'grams', notes: 'peeled' },
    { ingredientName: 'garlic', amount: '1', unit: 'tsp', notes: 'finely chopped' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'curry powder', amount: '3', unit: 'tbsp', notes: 'preferably Trinidadian' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'potatoes', amount: '225', unit: 'grams', notes: '2 medium, cubed, boiled 5 minutes and drained' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'Scotch bonnet chilli', amount: '1', unit: 'pieces', notes: 'deseeded and finely sliced' },
    { ingredientName: 'chandon beni or coriander leaves', amount: '1', unit: 'tbsp', notes: 'finely chopped (or 2 tbsp coriander)' },
    { ingredientName: 'Dhalpurie Roti', amount: '6', unit: 'pieces', notes: 'see carry-forwards' },
    { ingredientName: 'spring onions', amount: '1', unit: 'pieces', notes: 'bunch, coarsely chopped (for green seasoning)' },
    { ingredientName: 'chives', amount: '2', unit: 'tbsp', notes: 'coarsely chopped (for green seasoning)' },
    { ingredientName: 'parsley', amount: '2', unit: 'tbsp', notes: 'coarsely chopped (for green seasoning)' },
    { ingredientName: 'chandon beni or coriander leaves', amount: '3', unit: 'tbsp', notes: 'chopped (for green seasoning)' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'peeled (for green seasoning)' }
  ],
  'leilas-guyanese-chicken-curry': [
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'Madras curry paste', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'garlic cloves', amount: '5', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'fresh root ginger', amount: '1', unit: 'tsp', notes: 'grated' },
    { ingredientName: 'red chillies', amount: '2', unit: 'pieces', notes: 'chopped' },
    { ingredientName: 'chicken', amount: '1.6', unit: 'kg', notes: 'skinned and cut into 8–10 pieces' },
    { ingredientName: 'tomatoes', amount: '4', unit: 'pieces', notes: 'medium, skinned and chopped' },
    { ingredientName: 'curry leaves', amount: '6', unit: 'pieces', notes: '' },
    { ingredientName: 'potatoes', amount: '2', unit: 'pieces', notes: 'medium, peeled and quartered' },
    { ingredientName: 'coriander seeds', amount: '2', unit: 'tbsp', notes: 'for curry powder' },
    { ingredientName: 'cumin seeds', amount: '1', unit: 'tbsp', notes: 'for curry powder' },
    { ingredientName: 'cardamom pods', amount: '1', unit: 'tbsp', notes: 'for curry powder' },
    { ingredientName: 'black peppercorns', amount: '1', unit: 'tsp', notes: 'for curry powder' },
    { ingredientName: 'cloves', amount: '1', unit: 'tsp', notes: 'for curry powder' },
    { ingredientName: 'cinnamon stick', amount: '1', unit: 'pieces', notes: 'for curry powder' },
    { ingredientName: 'black mustard seeds', amount: '2', unit: 'tsp', notes: 'for curry powder' }
  ],
  'madras-curry': [
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: '' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'very finely chopped' },
    { ingredientName: 'plum tomatoes', amount: '250', unit: 'grams', notes: 'skinned and finely chopped' },
    { ingredientName: 'tomato purée', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'boned shoulder or leg of lamb', amount: '600', unit: 'grams', notes: 'cut into 3cm chunks' },
    { ingredientName: 'thick coconut milk', amount: '150', unit: 'ml', notes: '' },
    { ingredientName: 'coriander seeds', amount: '1', unit: 'tsp', notes: 'for dry spice blend' },
    { ingredientName: 'cumin seeds', amount: '1', unit: 'tsp', notes: 'for dry spice blend' },
    { ingredientName: 'mustard seeds', amount: '½', unit: 'tsp', notes: 'for dry spice blend' },
    { ingredientName: 'dried red chillies', amount: '3–4', unit: 'pieces', notes: 'for dry spice blend' },
    { ingredientName: 'black peppercorns', amount: '½', unit: 'tsp', notes: 'for dry spice blend' },
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: 'for coconut paste' },
    { ingredientName: 'ground cinnamon', amount: '½', unit: 'tsp', notes: 'for coconut paste' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'roughly chopped (for coconut paste)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'roughly chopped (for coconut paste)' },
    { ingredientName: 'freshly grated coconut', amount: '3', unit: 'tbsp', notes: 'for coconut paste' },
    { ingredientName: 'white wine vinegar', amount: '3', unit: 'tbsp', notes: 'for coconut paste' }
  ],
  'rogan-josh': [
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, roughly chopped' },
    { ingredientName: 'garlic cloves', amount: '4–5', unit: 'pieces', notes: 'roughly chopped' },
    { ingredientName: 'vegetable oil', amount: '4', unit: 'tbsp', notes: '' },
    { ingredientName: 'brown cardamom pod', amount: '1', unit: 'pieces', notes: 'split, optional' },
    { ingredientName: 'green cardamom pods', amount: '8', unit: 'pieces', notes: 'split' },
    { ingredientName: 'cinnamon sticks', amount: '2', unit: 'pieces', notes: '3cm each' },
    { ingredientName: 'dried bay leaf', amount: '1', unit: 'pieces', notes: '' },
    { ingredientName: 'cloves', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'black peppercorns', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'mace', amount: '', unit: 'pieces', notes: '1 blade' },
    { ingredientName: 'boned shoulder or leg of lamb', amount: '600', unit: 'grams', notes: 'cut into 3cm cubes' },
    { ingredientName: 'plain yogurt', amount: '125', unit: 'grams', notes: '' },
    { ingredientName: 'fennel seeds', amount: '2', unit: 'tsp', notes: 'roasted and ground (for spice mix)' },
    { ingredientName: 'ground coriander', amount: '¾', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'ground cumin', amount: '¾', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'mild paprika', amount: '2', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'chilli powder', amount: '1½', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'ground ginger', amount: '½', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: 'for spice mix' }
  ],
  'prawn-balti': [
    { ingredientName: 'raw king prawns', amount: '500', unit: 'grams', notes: 'peeled but last tail section left on' },
    { ingredientName: 'lime juice', amount: '', unit: 'pieces', notes: 'juice of 1 lime' },
    { ingredientName: 'paprika', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: 'for masala' },
    { ingredientName: 'red onion', amount: '1', unit: 'pieces', notes: 'diced (for masala)' },
    { ingredientName: 'fresh root ginger', amount: '4', unit: 'cm', notes: 'finely shredded (for masala)' },
    { ingredientName: 'garlic cloves', amount: '3', unit: 'pieces', notes: 'finely chopped (for masala)' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'shredded (for masala)' },
    { ingredientName: 'red pepper', amount: '1', unit: 'pieces', notes: 'deseeded and shredded (for masala)' },
    { ingredientName: 'chopped tomatoes', amount: '400', unit: 'grams', notes: 'canned (for masala)' },
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'red chilli powder', amount: '½', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'ground cinnamon', amount: '¼', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'ground coriander', amount: '½', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'caster sugar', amount: '2', unit: 'tsp', notes: 'for masala' },
    { ingredientName: 'coriander leaves', amount: '2', unit: 'tbsp', notes: 'coarsely chopped' }
  ],
  'curry-nanban-soba': [
    { ingredientName: 'dashi', amount: '1.4', unit: 'l', notes: 'see carry-forwards' },
    { ingredientName: 'chicken thighs', amount: '250', unit: 'grams', notes: 'skinned and cut into bite-sized pieces' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'cut into 8 segments lengthways' },
    { ingredientName: 'shoyu', amount: '150', unit: 'ml', notes: '' },
    { ingredientName: 'mirin', amount: '150', unit: 'ml', notes: '' },
    { ingredientName: 'dried soba', amount: '400', unit: 'grams', notes: '' },
    { ingredientName: 'spring onion', amount: '1', unit: 'pieces', notes: 'cut into thin rings' },
    { ingredientName: 'mange tout', amount: '8', unit: 'pieces', notes: 'blanched 1 minute, cut diagonally into thin slivers' },
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced lengthways (for curry roux)' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'plain flour', amount: '3', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mild Japanese or Indian curry powder', amount: '2½', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'tomato ketchup', amount: '1', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mango chutney', amount: '1', unit: 'tbsp', notes: 'for curry roux' }
  ],
  'curry-rice': [
    { ingredientName: 'Japanese rice', amount: '450', unit: 'grams', notes: '' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'butter', amount: '50', unit: 'grams', notes: '' },
    { ingredientName: 'stewing beef', amount: '250', unit: 'grams', notes: 'cubed' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'cut into 8 chunks lengthways' },
    { ingredientName: 'potatoes', amount: '2', unit: 'pieces', notes: 'peeled and each cut into 4–6 pieces' },
    { ingredientName: 'carrot', amount: '1', unit: 'pieces', notes: 'peeled and cut into 2cm pieces' },
    { ingredientName: 'bay leaf', amount: '1', unit: 'pieces', notes: '' },
    { ingredientName: 'beef or vegetable stock', amount: '700', unit: 'ml', notes: '' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced lengthways (for curry roux)' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'mild Japanese or Indian curry powder', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'plain flour', amount: '4', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mango chutney', amount: '1', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'tomato ketchup', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'shoyu', amount: '2', unit: 'tsp', notes: 'for curry roux' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'to taste (for curry roux)' },
    { ingredientName: 'white pepper', amount: '', unit: 'pieces', notes: 'to taste (for curry roux)' }
  ],
  'katsu-curry': [
    { ingredientName: 'pork loin steaks', amount: '4', unit: 'pieces', notes: 'about 150g each' },
    { ingredientName: 'plain flour', amount: '2', unit: 'tbsp', notes: 'for coating' },
    { ingredientName: 'egg', amount: '1', unit: 'pieces', notes: 'beaten' },
    { ingredientName: 'fine dry white breadcrumbs', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'vegetable oil', amount: '', unit: 'pieces', notes: 'for deep-frying' },
    { ingredientName: 'Japanese rice', amount: '450', unit: 'grams', notes: 'freshly cooked' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'butter', amount: '25', unit: 'grams', notes: 'for curry roux' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced lengthways (for curry roux)' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'mild Japanese or Indian curry powder', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'plain flour', amount: '4', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mango chutney', amount: '1', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'tomato ketchup', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'shoyu', amount: '2', unit: 'tsp', notes: 'for curry roux' },
    { ingredientName: 'vegetable oil', amount: '1', unit: 'tbsp', notes: 'for curry sauce' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced lengthways (for curry sauce)' },
    { ingredientName: 'button mushrooms', amount: '400', unit: 'grams', notes: 'halved or quartered (for curry sauce)' },
    { ingredientName: 'cooking apple', amount: '½', unit: 'pieces', notes: 'grated with skin (for curry sauce)' },
    { ingredientName: 'carrot', amount: '1', unit: 'pieces', notes: 'small, peeled and grated (for curry sauce)' },
    { ingredientName: 'celery stick', amount: '1', unit: 'pieces', notes: 'finely chopped (for curry sauce)' },
    { ingredientName: 'vegetable stock', amount: '600', unit: 'ml', notes: 'for curry sauce' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'to taste (for curry sauce)' },
    { ingredientName: 'ground white pepper', amount: '', unit: 'pieces', notes: 'to taste (for curry sauce)' }
  ],
  'garam-masala': [
    { ingredientName: 'coriander seeds', amount: '50', unit: 'grams', notes: '' },
    { ingredientName: 'cumin seeds', amount: '50', unit: 'grams', notes: '' },
    { ingredientName: 'green cardamom pods', amount: '20', unit: 'pieces', notes: '' },
    { ingredientName: 'cinnamon sticks', amount: '10', unit: 'pieces', notes: '2.5cm long' },
    { ingredientName: 'cloves', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'mace', amount: '10', unit: 'pieces', notes: 'blades' },
    { ingredientName: 'black cardamom pods', amount: '10', unit: 'pieces', notes: '' },
    { ingredientName: 'nutmeg', amount: '½', unit: 'pieces', notes: '' },
    { ingredientName: 'black peppercorns', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'cinnamon leaves or bay leaves', amount: '4', unit: 'pieces', notes: '' },
    { ingredientName: 'dried rose petals', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'fennel seeds', amount: '1', unit: 'tbsp', notes: '' }
  ],
  'achari-khargosh': [
    { ingredientName: 'rabbit legs', amount: '4–6', unit: 'pieces', notes: 'about 900g in total' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: 'for boiling' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: 'for boiling' },
    { ingredientName: 'mustard oil', amount: '3', unit: 'tbsp', notes: 'for sauce' },
    { ingredientName: 'ghee', amount: '75', unit: 'ml', notes: 'for sauce' },
    { ingredientName: 'dried red chillies', amount: '4', unit: 'pieces', notes: 'for sauce' },
    { ingredientName: 'mixed pickling spices', amount: '1', unit: 'tbsp', notes: 'see carry-forwards' },
    { ingredientName: 'garlic cloves', amount: '8', unit: 'pieces', notes: 'finely chopped (for sauce)' },
    { ingredientName: 'onions', amount: '150', unit: 'grams', notes: '2, finely chopped (for sauce)' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: 'for sauce' },
    { ingredientName: 'ground turmeric', amount: '½', unit: 'tsp', notes: 'for sauce' },
    { ingredientName: 'fresh root ginger', amount: '2.5', unit: 'cm', notes: 'cut into julienne strips (for sauce)' },
    { ingredientName: 'palm sugar or molasses', amount: '25', unit: 'grams', notes: 'for sauce' },
    { ingredientName: 'plain full-fat yogurt', amount: '300', unit: 'grams', notes: 'for sauce' },
    { ingredientName: 'chickpea flour', amount: '2', unit: 'tsp', notes: 'for sauce' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of 1 lemon (for sauce)' },
    { ingredientName: 'coriander leaves', amount: '1', unit: 'tbsp', notes: 'finely chopped (for sauce)' }
  ],
  'panchmael-daal': [
    { ingredientName: 'split green lentils (moong dal)', amount: '2', unit: 'tbsp', notes: 'heaped' },
    { ingredientName: 'split yellow lentils (toor dal)', amount: '2', unit: 'tbsp', notes: 'heaped' },
    { ingredientName: 'split gram lentils (chana dal)', amount: '2', unit: 'tbsp', notes: 'heaped' },
    { ingredientName: 'split and husked black lentils (urad dal)', amount: '2', unit: 'tbsp', notes: 'heaped' },
    { ingredientName: 'split red lentils (masoor dal)', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'salt', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground turmeric', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'ghee', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'red chilli powder', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'tomato', amount: '1', unit: 'pieces', notes: 'chopped' },
    { ingredientName: 'coriander leaves', amount: '1', unit: 'tbsp', notes: 'chopped' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'squeeze' },
    { ingredientName: 'ghee', amount: '1', unit: 'tbsp', notes: 'for tadka' },
    { ingredientName: 'dried red chilli', amount: '1', unit: 'pieces', notes: 'for tadka' },
    { ingredientName: 'cumin seeds', amount: '½', unit: 'tsp', notes: 'for tadka' },
    { ingredientName: 'cloves', amount: '4', unit: 'pieces', notes: 'for tadka' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for tadka)' }
  ],
  'lahsun-ki-chutney': [
    { ingredientName: 'vegetable or corn oil', amount: '250', unit: 'ml', notes: '' },
    { ingredientName: 'cumin seeds', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'garlic', amount: '125', unit: 'grams', notes: 'roughly chopped' },
    { ingredientName: 'dried red chillies', amount: '75', unit: 'grams', notes: 'soaked in 250ml water, drained and made into a paste' },
    { ingredientName: 'malt vinegar', amount: '75', unit: 'ml', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'kachri', amount: '250', unit: 'grams', notes: 'coarsely pounded; or increase garlic by same amount' },
    { ingredientName: 'sugar', amount: '3', unit: 'tbsp', notes: 'or to taste' },
    { ingredientName: 'coriander leaves', amount: '1', unit: 'tbsp', notes: 'chopped, optional' }
  ],
  'missi-roti': [
    { ingredientName: 'chickpea flour', amount: '300', unit: 'grams', notes: '' },
    { ingredientName: 'plain flour', amount: '200', unit: 'grams', notes: '' },
    { ingredientName: 'salt', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'fresh root ginger', amount: '1', unit: 'tsp', notes: 'finely chopped' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'deseeded and finely chopped' },
    { ingredientName: 'coriander leaves', amount: '1', unit: 'tbsp', notes: 'finely chopped' },
    { ingredientName: 'carom seeds', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground turmeric', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'red onion', amount: '1', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'spring onion', amount: '1', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'melted ghee', amount: '3', unit: 'tbsp', notes: 'for brushing and basting' }
  ],
  'kadhai-paneer': [
    { ingredientName: 'ghee or corn oil', amount: '1', unit: 'tbsp', notes: 'for stir-fry' },
    { ingredientName: 'crushed dried chillies', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'red or yellow peppers', amount: '2', unit: 'pieces', notes: 'deseeded and cut into 3cm strips' },
    { ingredientName: 'red onion', amount: '1', unit: 'pieces', notes: 'sliced 1cm thick' },
    { ingredientName: 'paneer', amount: '600', unit: 'grams', notes: 'cut into 3cm batons' },
    { ingredientName: 'coriander leaves', amount: '20', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'dried fenugreek leaves', amount: '½', unit: 'tsp', notes: 'crumbled' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of 1 lemon' },
    { ingredientName: 'fresh root ginger', amount: '5', unit: 'cm', notes: 'cut into julienne' },
    { ingredientName: 'ghee or corn oil', amount: '80', unit: 'grams', notes: 'for basic kadhai sauce' },
    { ingredientName: 'garlic cloves', amount: '30', unit: 'grams', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'coriander seeds', amount: '15', unit: 'grams', notes: 'coarsely pounded (for basic kadhai sauce)' },
    { ingredientName: 'red chillies', amount: '8', unit: 'pieces', notes: 'coarsely pounded (for basic kadhai sauce)' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'fresh root ginger', amount: '5', unit: 'cm', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'green chillies', amount: '3', unit: 'pieces', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'ripe tomatoes', amount: '750', unit: 'grams', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: 'for basic kadhai sauce' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: 'for basic kadhai sauce' },
    { ingredientName: 'dried fenugreek leaves', amount: '1½', unit: 'tsp', notes: 'crumbled (for basic kadhai sauce)' },
    { ingredientName: 'sugar', amount: '1', unit: 'tsp', notes: 'optional (for basic kadhai sauce)' }
  ],
  'subz-saag-gosht': [
    { ingredientName: 'ghee or corn oil', amount: '80', unit: 'grams', notes: '' },
    { ingredientName: 'cumin seeds', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'cloves', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'garlic', amount: '50', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'fresh root ginger', amount: '40', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'red chilli powder', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'boned leg of lamb', amount: '1', unit: 'kg', notes: 'cut into 2.5cm cubes' },
    { ingredientName: 'green chillies', amount: '4', unit: 'pieces', notes: 'slit lengthways' },
    { ingredientName: 'turnips', amount: '150', unit: 'grams', notes: 'cut into 1cm cubes' },
    { ingredientName: 'carrots', amount: '150', unit: 'grams', notes: 'cut into 1cm cubes' },
    { ingredientName: 'lamb stock or water', amount: '300', unit: 'ml', notes: '' },
    { ingredientName: 'tomatoes', amount: '200', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'spinach leaves', amount: '400', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'ground mixed spices', amount: '1½', unit: 'tsp', notes: 'equal parts cloves, nutmeg, mace and green cardamom' },
    { ingredientName: 'dill leaves', amount: '30', unit: 'grams', notes: 'finely chopped' }
  ],
  'naan': [
    { ingredientName: 'caster sugar', amount: '35', unit: 'grams', notes: '' },
    { ingredientName: 'eggs', amount: '2', unit: 'pieces', notes: '' },
    { ingredientName: 'full-fat milk', amount: '400', unit: 'ml', notes: '' },
    { ingredientName: 'plain flour', amount: '750', unit: 'grams', notes: '' },
    { ingredientName: 'baking powder', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: '' }
  ],
  'kachhi-mirch-ka-gosht': [
    { ingredientName: 'boned shoulder of lamb', amount: '1', unit: 'kg', notes: 'cut into 3.5cm cubes' },
    { ingredientName: 'plain yogurt', amount: '300', unit: 'grams', notes: '' },
    { ingredientName: 'black peppercorns', amount: '1½', unit: 'tsp', notes: 'coarsely crushed' },
    { ingredientName: 'coriander seeds', amount: '10', unit: 'grams', notes: 'roasted and coarsely pounded' },
    { ingredientName: 'cumin seeds', amount: '10', unit: 'grams', notes: 'roasted and coarsely pounded' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ghee or corn oil', amount: '80', unit: 'grams', notes: '' },
    { ingredientName: 'mace', amount: '', unit: 'pieces', notes: '1 blade' },
    { ingredientName: 'black cardamom pods', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'white onions', amount: '250', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'fresh root ginger', amount: '20', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'green chillies', amount: '6', unit: 'pieces', notes: 'slit lengthways' },
    { ingredientName: 'lamb stock or water', amount: '750', unit: 'ml', notes: '' },
    { ingredientName: 'cashew nut paste', amount: '40', unit: 'grams', notes: '' },
    { ingredientName: 'single cream', amount: '2½', unit: 'tbsp', notes: '' },
    { ingredientName: 'red onion', amount: '1', unit: 'pieces', notes: 'cut into 1cm cubes' },
    { ingredientName: 'mint leaves', amount: '1', unit: 'tbsp', notes: 'finely chopped' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of 1 lemon' },
    { ingredientName: 'ground roasted fennel seeds', amount: '1', unit: 'tsp', notes: '' }
  ],
  'subz-miloni': [
    { ingredientName: 'carrots', amount: '150', unit: 'grams', notes: 'cut into 1cm cubes' },
    { ingredientName: 'cauliflower', amount: '150', unit: 'grams', notes: 'trimmed into 1cm florets' },
    { ingredientName: 'fine green beans', amount: '100', unit: 'grams', notes: 'cut into 1cm lengths' },
    { ingredientName: 'young spinach leaves', amount: '1', unit: 'kg', notes: '' },
    { ingredientName: 'ghee or vegetable oil', amount: '75', unit: 'grams', notes: '' },
    { ingredientName: 'cumin seeds', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'garlic', amount: '40', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'fresh root ginger', amount: '2.5', unit: 'cm', notes: 'finely chopped' },
    { ingredientName: 'green chillies', amount: '6', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'ground coriander', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'button or chestnut mushrooms', amount: '100', unit: 'grams', notes: 'cut into 1cm cubes' },
    { ingredientName: 'baby corn', amount: '50', unit: 'grams', notes: 'cut into 1cm lengths, or canned sweetcorn (optional)' },
    { ingredientName: 'broccoli florets', amount: '50', unit: 'grams', notes: 'trimmed into 1cm pieces (optional)' },
    { ingredientName: 'frozen peas or petit pois', amount: '50', unit: 'grams', notes: 'thawed' },
    { ingredientName: 'chickpea flour', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'butter', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'single cream', amount: '4', unit: 'tbsp', notes: '' },
    { ingredientName: 'dried fenugreek leaves', amount: '1', unit: 'tsp', notes: 'crumbled' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: '' }
  ],
  'bateyr-masala': [
    { ingredientName: 'quails', amount: '6', unit: 'pieces', notes: 'about 300g each, skinned' },
    { ingredientName: 'ginger paste', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'garlic paste', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'red chilli powder', amount: '2½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'vegetable oil or ghee', amount: '200', unit: 'ml', notes: '' },
    { ingredientName: 'cinnamon stick', amount: '2.5', unit: 'cm', notes: '' },
    { ingredientName: 'mace', amount: '', unit: 'pieces', notes: '1 blade' },
    { ingredientName: 'black cardamom pods', amount: '2', unit: 'pieces', notes: '' },
    { ingredientName: 'black peppercorns', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'cloves', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'green cardamom pods', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'onions', amount: '250', unit: 'grams', notes: 'blended to a fine paste' },
    { ingredientName: 'ground coriander', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'plain yogurt', amount: '450', unit: 'grams', notes: '' },
    { ingredientName: 'chickpea flour', amount: '1½', unit: 'tbsp', notes: '' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'coriander leaves', amount: '50', unit: 'grams', notes: 'finely chopped' }
  ],
  'gucchi-aur-murgh-kalia': [
    { ingredientName: 'large dried morels', amount: '50', unit: 'grams', notes: '' },
    { ingredientName: 'onions', amount: '500', unit: 'grams', notes: 'finely sliced' },
    { ingredientName: 'oil', amount: '', unit: 'pieces', notes: 'for deep-frying' },
    { ingredientName: 'plain yogurt', amount: '300', unit: 'grams', notes: '' },
    { ingredientName: 'ghee or vegetable oil', amount: '100', unit: 'grams', notes: '' },
    { ingredientName: 'royal cumin seeds', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'whole allspice', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'nutmeg', amount: '½', unit: 'pieces', notes: '' },
    { ingredientName: 'mace', amount: '', unit: 'pieces', notes: '1 blade' },
    { ingredientName: 'green cardamom pods', amount: '4', unit: 'pieces', notes: '' },
    { ingredientName: 'black peppercorns', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'boned chicken thighs', amount: '1', unit: 'kg', notes: 'excess fat removed, each cut lengthways in half' },
    { ingredientName: 'ginger paste', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'garlic paste', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'Kashmiri red chilli powder', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'chicken stock', amount: '250', unit: 'ml', notes: '' },
    { ingredientName: 'single cream', amount: '100', unit: 'ml', notes: '' },
    { ingredientName: 'saffron threads', amount: '', unit: 'pieces', notes: 'pinch' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'rose water', amount: '', unit: 'pieces', notes: 'few drops, optional' },
    { ingredientName: 'gold leaf', amount: '2', unit: 'pieces', notes: 'sheets, completely optional' }
  ],

  'butter-bean-curry': [
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: '' },
    { ingredientName: 'mustard seeds', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'curry leaves', amount: '2', unit: 'pieces', notes: 'sprigs, about 2 tbsp leaves' },
    { ingredientName: 'fenugreek seeds', amount: '3–4', unit: 'pieces', notes: '' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'diced' },
    { ingredientName: 'fresh root ginger', amount: '3', unit: 'cm', notes: 'finely chopped' },
    { ingredientName: 'garlic cloves', amount: '3', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'deseeded and chopped' },
    { ingredientName: 'plum tomatoes', amount: '4', unit: 'pieces', notes: 'skinned and chopped' },
    { ingredientName: 'carrot', amount: '1', unit: 'pieces', notes: 'peeled and cut into 3cm chunks' },
    { ingredientName: 'ground coriander', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground cumin', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'red pepper', amount: '1', unit: 'pieces', notes: 'deseeded and cut into 3cm chunks' },
    { ingredientName: 'green beans', amount: '75', unit: 'grams', notes: 'cut into 3cm lengths' },
    { ingredientName: 'butter beans', amount: '400', unit: 'grams', notes: 'canned, drained' },
    { ingredientName: 'coriander leaves', amount: '2', unit: 'tbsp', notes: 'chopped' }
  ],
  'plantain-curry': [
    { ingredientName: 'plantains', amount: '4', unit: 'pieces', notes: '' },
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: '' },
    { ingredientName: 'mustard seeds', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'cumin seeds', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'curry leaves', amount: '1', unit: 'pieces', notes: 'sprig, about 1 tbsp leaves' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'fresh root ginger', amount: '3', unit: 'cm', notes: 'finely chopped' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'deseeded and chopped' },
    { ingredientName: 'ground turmeric', amount: '', unit: 'pieces', notes: 'pinch' },
    { ingredientName: 'coriander leaves', amount: '2', unit: 'tbsp', notes: 'chopped' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'to sharpen' }
  ],
  'bunny-chow': [
    { ingredientName: 'white sandwich loaf', amount: '1', unit: 'pieces', notes: 'large, unsliced' },
    { ingredientName: 'vegetable oil', amount: '4–6', unit: 'tbsp', notes: '' },
    { ingredientName: 'curry leaves', amount: '3', unit: 'pieces', notes: 'sprigs, about 3 tbsp leaves' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'diced' },
    { ingredientName: 'fresh root ginger', amount: '5', unit: 'cm', notes: 'shredded' },
    { ingredientName: 'crushed dried chillies', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'potato', amount: '150', unit: 'grams', notes: 'peeled and diced' },
    { ingredientName: 'chopped tomatoes', amount: '400', unit: 'grams', notes: 'canned' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'green beans', amount: '150', unit: 'grams', notes: 'roughly chopped' },
    { ingredientName: 'kidney beans', amount: '800', unit: 'grams', notes: '2 × 400g cans, with liquid' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of 1 small lemon' },
    { ingredientName: 'coriander leaves', amount: '', unit: 'pieces', notes: 'large handful, chopped' }
  ],
  'river-lime-curried-duck': [
    { ingredientName: 'duck', amount: '2.25', unit: 'kg', notes: 'skinned, trimmed of excess fat, cut into serving pieces' },
    { ingredientName: 'thyme', amount: '1', unit: 'pieces', notes: 'bunch, stalks removed' },
    { ingredientName: 'fresh root ginger', amount: '1', unit: 'tbsp', notes: 'finely chopped' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'pounded to a paste' },
    { ingredientName: 'red onion', amount: '1', unit: 'pieces', notes: 'cut into small dice' },
    { ingredientName: 'seasoning peppers', amount: '5', unit: 'pieces', notes: 'finely chopped; or 1 Scotch bonnet, deseeded and finely chopped' },
    { ingredientName: 'chandon beni or coriander leaves', amount: '1', unit: 'pieces', notes: 'bunch, chopped' },
    { ingredientName: 'Trinidadian curry powder', amount: '5', unit: 'tbsp', notes: '' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'roasted cumin seeds', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '4', unit: 'tbsp', notes: '' },
    { ingredientName: 'coconut milk', amount: '900', unit: 'ml', notes: 'or up to 1.2 litres' },
    { ingredientName: 'Scotch bonnet chilli', amount: '1', unit: 'pieces', notes: 'whole' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'to taste' },
    { ingredientName: 'pepper', amount: '', unit: 'pieces', notes: 'to taste' }
  ],
  'dhansak': [
    { ingredientName: 'garlic cloves', amount: '6', unit: 'pieces', notes: 'roughly chopped' },
    { ingredientName: 'fresh root ginger', amount: '3', unit: 'cm', notes: 'roughly chopped' },
    { ingredientName: 'vegetable oil', amount: '4', unit: 'tbsp', notes: '' },
    { ingredientName: 'star anise', amount: '1', unit: 'pieces', notes: '' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'very finely chopped' },
    { ingredientName: 'boned shoulder or leg of lamb', amount: '600', unit: 'grams', notes: 'cut into 3cm cubes' },
    { ingredientName: 'ground coriander', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'cracked black peppercorns', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground cinnamon', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'crushed cardamom seeds', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'chilli powder', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground cumin', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'split gram lentils (chana dal)', amount: '25', unit: 'grams', notes: 'for lentils' },
    { ingredientName: 'split red lentils (masoor dal)', amount: '25', unit: 'grams', notes: 'for lentils' },
    { ingredientName: 'aubergine', amount: '1', unit: 'pieces', notes: 'small, diced (for lentils)' },
    { ingredientName: 'fresh fenugreek leaves or mustard greens', amount: '', unit: 'pieces', notes: 'handful (for lentils)' },
    { ingredientName: 'pumpkin flesh', amount: '75', unit: 'grams', notes: 'diced (for lentils)' },
    { ingredientName: 'tamarind water', amount: '125', unit: 'ml', notes: 'or to taste (to finish)' },
    { ingredientName: 'palm sugar', amount: '1', unit: 'tsp', notes: 'rounded (to finish)' },
    { ingredientName: 'mint leaves', amount: '2', unit: 'tbsp', notes: 'shredded (to finish)' }
  ],
  'chicken-korma': [
    { ingredientName: 'saffron threads', amount: '¼', unit: 'tsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: '' },
    { ingredientName: 'ghee or clarified butter', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'mace', amount: '', unit: 'pieces', notes: '1 blade' },
    { ingredientName: 'cloves', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'cardamom pods', amount: '6', unit: 'pieces', notes: 'split' },
    { ingredientName: 'cinnamon stick', amount: '4', unit: 'cm', notes: '' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'very finely chopped' },
    { ingredientName: 'fresh root ginger', amount: '3', unit: 'cm', notes: 'roughly chopped' },
    { ingredientName: 'garlic cloves', amount: '6', unit: 'pieces', notes: 'roughly chopped' },
    { ingredientName: 'boned chicken thighs', amount: '600', unit: 'grams', notes: 'about 4 thighs' },
    { ingredientName: 'mild chilli powder or paprika', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground coriander', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced (for browned onion paste)' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'for browned onion paste' },
    { ingredientName: 'vegetable oil', amount: '', unit: 'pieces', notes: 'for deep-frying (browned onion paste)' },
    { ingredientName: 'cashew nuts', amount: '1', unit: 'tbsp', notes: 'for nut paste' },
    { ingredientName: 'almonds', amount: '1', unit: 'tbsp', notes: 'blanched (for nut paste)' },
    { ingredientName: 'thick coconut milk', amount: '75', unit: 'ml', notes: 'to finish' },
    { ingredientName: 'single cream', amount: '75', unit: 'ml', notes: 'to finish' },
    { ingredientName: 'coriander leaves', amount: '1', unit: 'tbsp', notes: 'chopped (to finish)' }
  ],
  'chicken-tikka-masala': [
    { ingredientName: 'boned chicken thighs', amount: '675', unit: 'grams', notes: 'about 6, skinned' },
    { ingredientName: 'lime juice', amount: '', unit: 'pieces', notes: 'juice of 2 limes' },
    { ingredientName: 'paprika', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'cumin seeds', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'coriander seeds', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'shallots', amount: '2', unit: 'pieces', notes: 'roughly chopped' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'large, roughly chopped' },
    { ingredientName: 'fresh root ginger', amount: '4', unit: 'cm', notes: 'roughly chopped' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'deseeded and roughly chopped' },
    { ingredientName: 'plain Greek-style yogurt', amount: '125', unit: 'grams', notes: '' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'vegetable oil', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'chopped tomatoes', amount: '400', unit: 'grams', notes: 'canned (for sauce)' },
    { ingredientName: 'tomato purée', amount: '1', unit: 'tsp', notes: 'rounded (for sauce)' },
    { ingredientName: 'coriander leaves', amount: '', unit: 'pieces', notes: 'handful, roughly chopped (for sauce)' },
    { ingredientName: 'fresh root ginger', amount: '3', unit: 'cm', notes: 'grated (for sauce)' },
    { ingredientName: 'lime juice', amount: '1', unit: 'tsp', notes: 'for sauce' },
    { ingredientName: 'caster sugar', amount: '½', unit: 'tsp', notes: 'for sauce' },
    { ingredientName: 'unsalted butter', amount: '50', unit: 'grams', notes: 'for sauce' },
    { ingredientName: 'single cream', amount: '125', unit: 'ml', notes: 'for sauce' }
  ],
  'laal-maas': [
    { ingredientName: 'dried red chillies', amount: '25–35', unit: 'pieces', notes: 'stalks removed' },
    { ingredientName: 'cloves', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'ghee or vegetable oil', amount: '150', unit: 'grams', notes: '' },
    { ingredientName: 'plain yogurt', amount: '250', unit: 'grams', notes: 'whisked until smooth' },
    { ingredientName: 'cumin seeds', amount: '2', unit: 'tsp', notes: 'roasted' },
    { ingredientName: 'ground coriander', amount: '20', unit: 'grams', notes: '' },
    { ingredientName: 'red chilli powder', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'cinnamon leaves or bay leaves', amount: '3', unit: 'pieces', notes: '' },
    { ingredientName: 'green cardamom pods', amount: '6', unit: 'pieces', notes: '' },
    { ingredientName: 'black cardamom pods', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'garlic cloves', amount: '75', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'onions', amount: '250', unit: 'grams', notes: 'finely chopped' },
    { ingredientName: 'leg of lamb or goat', amount: '1', unit: 'kg', notes: 'with bone, chopped into 2.5cm cubes' },
    { ingredientName: 'lamb stock or water', amount: '750', unit: 'ml', notes: '' },
    { ingredientName: 'coriander leaves', amount: '30', unit: 'grams', notes: 'finely chopped' }
  ],
  'makai-ka-soweta': [
    { ingredientName: 'boned shoulder of lamb', amount: '1', unit: 'kg', notes: 'cut into 2.5cm cubes' },
    { ingredientName: 'ghee or corn oil', amount: '100', unit: 'grams', notes: '' },
    { ingredientName: 'cumin seeds', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'green cardamom pods', amount: '5', unit: 'pieces', notes: '' },
    { ingredientName: 'black cardamom pods', amount: '4', unit: 'pieces', notes: '' },
    { ingredientName: 'cloves', amount: '10', unit: 'pieces', notes: '' },
    { ingredientName: 'cinnamon leaves or bay leaves', amount: '2', unit: 'pieces', notes: '' },
    { ingredientName: 'lamb stock or water', amount: '750', unit: 'ml', notes: '' },
    { ingredientName: 'canned sweetcorn', amount: '450', unit: 'grams', notes: 'drained and coarsely chopped' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of ½ lemon' },
    { ingredientName: 'coriander leaves', amount: '30', unit: 'grams', notes: 'chopped' },
    { ingredientName: 'plain yogurt', amount: '300', unit: 'grams', notes: 'for marinade' },
    { ingredientName: 'ground coriander', amount: '2', unit: 'tsp', notes: 'for marinade' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: 'for marinade' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: 'for marinade' },
    { ingredientName: 'onions', amount: '200', unit: 'grams', notes: 'finely chopped (for onion paste)' },
    { ingredientName: 'garlic cloves', amount: '75', unit: 'grams', notes: 'finely chopped (for onion paste)' },
    { ingredientName: 'green chillies', amount: '12', unit: 'pieces', notes: 'for onion paste' }
  ],
  'pitod-ka-saag': [
    { ingredientName: 'plain Greek-style yogurt', amount: '750', unit: 'grams', notes: 'for dumplings' },
    { ingredientName: 'chickpea flour', amount: '100', unit: 'grams', notes: 'for dumplings' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: 'for dumplings' },
    { ingredientName: 'ground turmeric', amount: '½', unit: 'tsp', notes: 'for dumplings' },
    { ingredientName: 'sugar', amount: '1½', unit: 'tsp', notes: 'for dumplings' },
    { ingredientName: 'ground garam masala', amount: '1½', unit: 'tsp', notes: 'for dumplings' },
    { ingredientName: 'fresh root ginger', amount: '2.5', unit: 'cm', notes: 'finely chopped (for dumplings)' },
    { ingredientName: 'ghee', amount: '2', unit: 'tbsp', notes: 'for dumplings' },
    { ingredientName: 'fennel seeds', amount: '1', unit: 'tsp', notes: 'for dumplings' },
    { ingredientName: 'asafoetida', amount: '', unit: 'pieces', notes: 'pinch (for dumplings)' },
    { ingredientName: 'oil', amount: '', unit: 'pieces', notes: 'for frying' },
    { ingredientName: 'corn oil', amount: '2', unit: 'tbsp', notes: 'for yogurt sauce' },
    { ingredientName: 'asafoetida', amount: '', unit: 'pieces', notes: 'pinch (for yogurt sauce)' },
    { ingredientName: 'cumin seeds', amount: '½', unit: 'tbsp', notes: 'for yogurt sauce' },
    { ingredientName: 'cloves', amount: '4', unit: 'pieces', notes: 'for yogurt sauce' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'finely chopped (for yogurt sauce)' },
    { ingredientName: 'plain Greek-style yogurt', amount: '200', unit: 'grams', notes: 'for yogurt sauce' },
    { ingredientName: 'ground coriander', amount: '2', unit: 'tbsp', notes: 'for yogurt sauce' },
    { ingredientName: 'ground turmeric', amount: '½', unit: 'tsp', notes: 'for yogurt sauce' },
    { ingredientName: 'red chilli powder', amount: '½', unit: 'tsp', notes: 'for yogurt sauce' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'stalk removed and slit into 4 (for yogurt sauce)' },
    { ingredientName: 'fresh root ginger', amount: '1', unit: 'cm', notes: 'in julienne (for yogurt sauce)' },
    { ingredientName: 'coriander leaves', amount: '20', unit: 'grams', notes: 'chopped (for yogurt sauce)' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of ½ lemon (for yogurt sauce)' }
  ],
  'rezala': [
    { ingredientName: 'boned leg of goat', amount: '1', unit: 'kg', notes: 'cut into 2.5cm cubes' },
    { ingredientName: 'corn oil or ghee', amount: '200', unit: 'ml', notes: '' },
    { ingredientName: 'green chillies', amount: '200', unit: 'grams', notes: 'slit lengthways and deseeded' },
    { ingredientName: 'crisp-fried onions', amount: '200', unit: 'grams', notes: 'crushed coarsely' },
    { ingredientName: 'pineapple', amount: '25', unit: 'grams', notes: 'blended to a paste' },
    { ingredientName: 'plain Greek-style yogurt', amount: '200', unit: 'grams', notes: '' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'tbsp', notes: 'finely chopped' },
    { ingredientName: 'garlic paste', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'roasted chickpea flour', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'salt', amount: '25', unit: 'grams', notes: '' },
    { ingredientName: 'whole allspice', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'royal cumin or black cumin seeds', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground cumin', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground garam masala', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'layered paratha dough', amount: '', unit: 'pieces', notes: 'or flour-and-water dough, to seal (see carry-forwards)' },
    { ingredientName: 'single cream', amount: '100', unit: 'ml', notes: 'to finish' },
    { ingredientName: 'fried cashew nuts', amount: '50', unit: 'grams', notes: 'pounded or blended to a paste (to finish)' },
    { ingredientName: 'coriander leaves', amount: '120', unit: 'grams', notes: 'chopped (to finish)' },
    { ingredientName: 'mint leaves', amount: '20', unit: 'grams', notes: 'chopped (to finish)' }
  ],
  'daal-makhani': [
    { ingredientName: 'whole black lentils (urad)', amount: '250', unit: 'grams', notes: 'soaked overnight' },
    { ingredientName: 'ginger paste', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'garlic paste', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'salt', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'tomato purée', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'slightly salted butter', amount: '150', unit: 'grams', notes: '' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'ground dried fenugreek leaves', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'sugar', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'single cream', amount: '4', unit: 'tbsp', notes: '' }
  ],
  'cari-chay': [
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: '' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'large, crushed' },
    { ingredientName: 'shallot', amount: '1', unit: 'pieces', notes: 'large, thinly sliced' },
    { ingredientName: 'Vietnamese Cari or Indian curry powder', amount: '1-1½', unit: 'tbsp', notes: '' },
    { ingredientName: 'palm sugar', amount: '1', unit: 'tbsp', notes: '' },
    { ingredientName: 'thick coconut milk', amount: '1', unit: 'l', notes: '' },
    { ingredientName: 'lime juice', amount: '', unit: 'pieces', notes: 'juice of 1 lime' },
    { ingredientName: 'fish sauce', amount: '2', unit: 'tbsp', notes: 'optional' },
    { ingredientName: 'annatto seed extract', amount: '2', unit: 'tsp', notes: 'optional' },
    { ingredientName: 'lemongrass stalks', amount: '2', unit: 'pieces', notes: 'outer leaves discarded then bruised' },
    { ingredientName: 'kaffir lime leaves', amount: '2', unit: 'pieces', notes: 'bruised' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'to taste' },
    { ingredientName: 'firm tofu', amount: '900', unit: 'grams', notes: 'cut into 2.5cm cubes' },
    { ingredientName: 'boiled bamboo shoot', amount: '1', unit: 'pieces', notes: 'large, thinly sliced' },
    { ingredientName: 'Asian aubergines', amount: '2', unit: 'pieces', notes: 'halved lengthways and cut into 2.5cm pieces' },
    { ingredientName: 'Vietnamese coriander or Thai basil leaves', amount: '24', unit: 'pieces', notes: '' }
  ],
  'mtuzi-wa-samaki': [
    { ingredientName: 'lime juice', amount: '', unit: 'pieces', notes: 'juice of 1 lime' },
    { ingredientName: 'cracked black peppercorns', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'haddock fillet', amount: '600', unit: 'grams', notes: 'skinned and cut into 5cm pieces' },
    { ingredientName: 'vegetable oil', amount: '6', unit: 'tbsp', notes: '' },
    { ingredientName: 'dried red chillies', amount: '2', unit: 'pieces', notes: 'for spice mixture' },
    { ingredientName: 'coriander seeds', amount: '¾', unit: 'tsp', notes: 'for spice mixture' },
    { ingredientName: 'cumin seeds', amount: '¾', unit: 'tsp', notes: 'for spice mixture' },
    { ingredientName: 'mustard seeds', amount: '1', unit: 'tsp', notes: 'for spice mixture' },
    { ingredientName: 'ground turmeric', amount: '4', unit: 'tsp', notes: 'for spice mixture' },
    { ingredientName: 'red onion', amount: '1', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'red pepper', amount: '1', unit: 'pieces', notes: 'deseeded and shredded' },
    { ingredientName: 'red chilli', amount: '1', unit: 'pieces', notes: 'finely shredded' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'plum tomatoes', amount: '250', unit: 'grams', notes: 'skinned and finely chopped' },
    { ingredientName: 'thick coconut milk', amount: '200', unit: 'ml', notes: '' },
    { ingredientName: 'tamarind water', amount: '125', unit: 'ml', notes: 'or to taste' }
  ],
  'dahi-wali-machli': [
    { ingredientName: 'catfish, perch or carp fillet', amount: '1', unit: 'kg', notes: 'cut into 4cm cubes' },
    { ingredientName: 'salt', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of 1 lemon' },
    { ingredientName: 'ground turmeric', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'carom seeds', amount: '1', unit: 'tbsp', notes: 'optional' },
    { ingredientName: 'chickpea flour', amount: '2', unit: 'tbsp', notes: 'for coating' },
    { ingredientName: 'ground cumin', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'fresh root ginger', amount: '2.5', unit: 'cm', notes: 'finely chopped' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'slit' },
    { ingredientName: 'plain yogurt', amount: '450', unit: 'grams', notes: '' },
    { ingredientName: 'oil', amount: '', unit: 'pieces', notes: 'for deep frying' },
    { ingredientName: 'ghee or corn oil', amount: '3', unit: 'tbsp', notes: 'for sauce' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'finely chopped' },
    { ingredientName: 'chickpea flour', amount: '40', unit: 'grams', notes: 'for sauce' },
    { ingredientName: 'fish stock or water', amount: '250', unit: 'ml', notes: '' },
    { ingredientName: 'dried fenugreek leaves', amount: '½', unit: 'tsp', notes: 'crumbled' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: '' }
  ],
  'nalli-gosht': [
    { ingredientName: 'lamb shanks', amount: '4', unit: 'pieces', notes: '' },
    { ingredientName: 'corn oil', amount: '3', unit: 'tbsp', notes: '' },
    { ingredientName: 'black cardamom pods', amount: '2', unit: 'pieces', notes: 'crushed' },
    { ingredientName: 'cinnamon sticks', amount: '2', unit: 'pieces', notes: '' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'ginger paste', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'garlic paste', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'chilli powder', amount: '1½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground fennel seeds', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground coriander', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground ginger', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'plain yogurt', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'tomatoes', amount: '5', unit: 'pieces', notes: 'puréed' },
    { ingredientName: 'salt', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'lamb stock or water', amount: '600', unit: 'ml', notes: '' },
    { ingredientName: 'ground garam masala', amount: '¼', unit: 'tsp', notes: 'to finish' },
    { ingredientName: 'saffron threads', amount: '', unit: 'pieces', notes: 'generous pinch (to finish)' },
    { ingredientName: 'rose water', amount: '3', unit: 'pieces', notes: 'drops, optional (to finish)' },
    { ingredientName: 'single cream', amount: '2', unit: 'tbsp', notes: 'to finish' }
  ],
  'ghee': [
    { ingredientName: 'unsalted butter', amount: '250', unit: 'grams', notes: '' }
  ],
  'bobotie': [
    { ingredientName: 'white bread', amount: '2', unit: 'pieces', notes: 'slices, crusts removed' },
    { ingredientName: 'milk', amount: '125', unit: 'ml', notes: '' },
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'butter', amount: '50', unit: 'grams', notes: '' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'roughly chopped' },
    { ingredientName: 'red chillies', amount: '2', unit: 'pieces', notes: 'deseeded and chopped' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'large, finely chopped' },
    { ingredientName: 'minced lamb', amount: '600', unit: 'grams', notes: '' },
    { ingredientName: 'mild curry powder', amount: '2½', unit: 'tsp', notes: '' },
    { ingredientName: 'ground cinnamon', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'cracked black peppercorns', amount: '¾', unit: 'tsp', notes: '' },
    { ingredientName: 'lemon', amount: '1', unit: 'pieces', notes: 'grated zest and juice' },
    { ingredientName: 'hot mango chutney', amount: '1', unit: 'tbsp', notes: "Mrs Ball's Extra Hot or other, chopped" },
    { ingredientName: 'demerara sugar', amount: '1', unit: 'tsp', notes: '' },
    { ingredientName: 'blanched almonds', amount: '1', unit: 'tbsp', notes: 'halved' },
    { ingredientName: 'lemon leaves or bay leaves', amount: '6', unit: 'pieces', notes: '' },
    { ingredientName: 'eggs', amount: '2', unit: 'pieces', notes: 'large (for savoury topping)' },
    { ingredientName: 'single cream', amount: '100', unit: 'ml', notes: 'for savoury topping' },
    { ingredientName: 'milk', amount: '100', unit: 'ml', notes: 'for savoury topping' },
    { ingredientName: 'crushed black peppercorns', amount: '¼', unit: 'tsp', notes: 'for savoury topping' },
    { ingredientName: 'nutmeg', amount: '', unit: 'pieces', notes: 'pinch of grated (for savoury topping)' }
  ]
}

const EXTRA_INGREDIENTS = {
  'cari-chay': [
    { ingredientName: 'lemongrass stalks', amount: '2', unit: 'pieces', notes: 'outer leaves discarded then bruised' },
    { ingredientName: 'kaffir lime leaves', amount: '2', unit: 'pieces', notes: 'bruised' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'to taste' }
  ],
  'trinidadian-roti': [
    { ingredientName: 'spring onions', amount: '1', unit: 'pieces', notes: 'bunch, coarsely chopped (for green seasoning)' },
    { ingredientName: 'chives', amount: '2', unit: 'tbsp', notes: 'coarsely chopped (for green seasoning)' },
    { ingredientName: 'parsley', amount: '2', unit: 'tbsp', notes: 'coarsely chopped (for green seasoning)' },
    { ingredientName: 'chandon beni or coriander leaves', amount: '3', unit: 'tbsp', notes: 'chopped (for green seasoning)' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'peeled (for green seasoning)' }
  ],
  'leilas-guyanese-chicken-curry': [
    { ingredientName: 'coriander seeds', amount: '2', unit: 'tbsp', notes: 'for curry powder' },
    { ingredientName: 'cumin seeds', amount: '1', unit: 'tbsp', notes: 'for curry powder' },
    { ingredientName: 'cardamom pods', amount: '1', unit: 'tbsp', notes: 'for curry powder' },
    { ingredientName: 'black peppercorns', amount: '1', unit: 'tsp', notes: 'for curry powder' },
    { ingredientName: 'cloves', amount: '1', unit: 'tsp', notes: 'for curry powder' },
    { ingredientName: 'cinnamon stick', amount: '1', unit: 'pieces', notes: 'for curry powder' },
    { ingredientName: 'black mustard seeds', amount: '2', unit: 'tsp', notes: 'for curry powder' }
  ],
  'kadhai-paneer': [
    { ingredientName: 'garlic cloves', amount: '30', unit: 'grams', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'coriander seeds', amount: '15', unit: 'grams', notes: 'coarsely pounded (for basic kadhai sauce)' },
    { ingredientName: 'red chillies', amount: '8', unit: 'pieces', notes: 'coarsely pounded (for basic kadhai sauce)' },
    { ingredientName: 'onions', amount: '2', unit: 'pieces', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'fresh root ginger', amount: '5', unit: 'cm', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'green chillies', amount: '3', unit: 'pieces', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'ripe tomatoes', amount: '750', unit: 'grams', notes: 'finely chopped (for basic kadhai sauce)' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: 'for basic kadhai sauce' },
    { ingredientName: 'ground garam masala', amount: '1', unit: 'tsp', notes: 'for basic kadhai sauce' },
    { ingredientName: 'dried fenugreek leaves', amount: '1½', unit: 'tsp', notes: 'crumbled (for basic kadhai sauce)' },
    { ingredientName: 'sugar', amount: '1', unit: 'tsp', notes: 'optional (for basic kadhai sauce)' },
    { ingredientName: 'ghee or corn oil', amount: '80', unit: 'grams', notes: 'for basic kadhai sauce' }
  ],
  'prawn-balti': [
    { ingredientName: 'garlic cloves', amount: '3', unit: 'pieces', notes: 'finely chopped' }
  ],
  'chicken-korma': [
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced (for browned onion paste)' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'for browned onion paste' },
    { ingredientName: 'vegetable oil', amount: '', unit: 'pieces', notes: 'for deep-frying (browned onion paste)' },
    { ingredientName: 'cashew nuts', amount: '1', unit: 'tbsp', notes: 'for nut paste' },
    { ingredientName: 'almonds', amount: '1', unit: 'tbsp', notes: 'blanched (for nut paste)' }
  ],
  'madras-curry': [
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: 'for coconut paste' },
    { ingredientName: 'ground cinnamon', amount: '½', unit: 'tsp', notes: 'for coconut paste' },
    { ingredientName: 'garlic cloves', amount: '4', unit: 'pieces', notes: 'roughly chopped (for coconut paste)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'roughly chopped (for coconut paste)' },
    { ingredientName: 'freshly grated coconut', amount: '3', unit: 'tbsp', notes: 'for coconut paste' },
    { ingredientName: 'white wine vinegar', amount: '3', unit: 'tbsp', notes: 'for coconut paste' }
  ],
  'rogan-josh': [
    { ingredientName: 'fennel seeds', amount: '2', unit: 'tsp', notes: 'roasted and ground (for spice mix)' },
    { ingredientName: 'ground coriander', amount: '¾', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'ground cumin', amount: '¾', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'mild paprika', amount: '2', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'chilli powder', amount: '1½', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'ground ginger', amount: '½', unit: 'tsp', notes: 'for spice mix' },
    { ingredientName: 'ground turmeric', amount: '¼', unit: 'tsp', notes: 'for spice mix' }
  ],
  'dhansak': [
    { ingredientName: 'split gram lentils (chana dal)', amount: '25', unit: 'grams', notes: 'for lentils' },
    { ingredientName: 'split red lentils (masoor dal)', amount: '25', unit: 'grams', notes: 'for lentils' },
    { ingredientName: 'aubergine', amount: '1', unit: 'pieces', notes: 'small, diced (for lentils)' },
    { ingredientName: 'fresh fenugreek leaves or mustard greens', amount: '', unit: 'pieces', notes: 'handful (for lentils)' },
    { ingredientName: 'pumpkin flesh', amount: '75', unit: 'grams', notes: 'diced (for lentils)' },
    { ingredientName: 'tamarind water', amount: '125', unit: 'ml', notes: 'or to taste (to finish)' },
    { ingredientName: 'palm sugar', amount: '1', unit: 'tsp', notes: 'rounded (to finish)' },
    { ingredientName: 'mint leaves', amount: '2', unit: 'tbsp', notes: 'shredded (to finish)' }
  ],
  'curry-nanban-soba': [
    { ingredientName: 'vegetable oil', amount: '3', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced (for curry roux)' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'plain flour', amount: '3', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mild Japanese or Indian curry powder', amount: '2½', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'tomato ketchup', amount: '1', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mango chutney', amount: '1', unit: 'tbsp', notes: 'for curry roux' }
  ],
  'curry-rice': [
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced (for curry roux)' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'mild Japanese or Indian curry powder', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'plain flour', amount: '4', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mango chutney', amount: '1', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'tomato ketchup', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'shoyu', amount: '2', unit: 'tsp', notes: 'for curry roux' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'for curry roux' },
    { ingredientName: 'white pepper', amount: '', unit: 'pieces', notes: 'for curry roux' }
  ],
  'katsu-curry': [
    { ingredientName: 'vegetable oil', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'butter', amount: '25', unit: 'grams', notes: 'for curry roux' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced (for curry roux)' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'fresh root ginger', amount: '2', unit: 'cm', notes: 'finely chopped (for curry roux)' },
    { ingredientName: 'mild Japanese or Indian curry powder', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'plain flour', amount: '4', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'mango chutney', amount: '1', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'tomato ketchup', amount: '2', unit: 'tbsp', notes: 'for curry roux' },
    { ingredientName: 'shoyu', amount: '2', unit: 'tsp', notes: 'for curry roux' },
    { ingredientName: 'vegetable oil', amount: '1', unit: 'tbsp', notes: 'for curry sauce' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'thinly sliced (for curry sauce)' },
    { ingredientName: 'button mushrooms', amount: '400', unit: 'grams', notes: 'halved or quartered (for curry sauce)' },
    { ingredientName: 'cooking apple', amount: '½', unit: 'pieces', notes: 'grated with skin (for curry sauce)' },
    { ingredientName: 'carrot', amount: '1', unit: 'pieces', notes: 'small, peeled and grated (for curry sauce)' },
    { ingredientName: 'celery stick', amount: '1', unit: 'pieces', notes: 'finely chopped (for curry sauce)' },
    { ingredientName: 'vegetable stock', amount: '600', unit: 'ml', notes: 'for curry sauce' },
    { ingredientName: 'salt', amount: '', unit: 'pieces', notes: 'for curry sauce' },
    { ingredientName: 'ground white pepper', amount: '', unit: 'pieces', notes: 'for curry sauce' }
  ],
  'makai-ka-soweta': [
    { ingredientName: 'plain yogurt', amount: '300', unit: 'grams', notes: 'for marinade' },
    { ingredientName: 'ground coriander', amount: '2', unit: 'tsp', notes: 'for marinade' },
    { ingredientName: 'ground turmeric', amount: '1', unit: 'tsp', notes: 'for marinade' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: 'for marinade' },
    { ingredientName: 'onions', amount: '200', unit: 'grams', notes: 'finely chopped (for onion paste)' },
    { ingredientName: 'garlic cloves', amount: '75', unit: 'grams', notes: 'finely chopped (for onion paste)' },
    { ingredientName: 'green chillies', amount: '12', unit: 'pieces', notes: 'for onion paste' }
  ],
  'pitod-ka-saag': [
    { ingredientName: 'corn oil', amount: '2', unit: 'tbsp', notes: 'for yogurt sauce' },
    { ingredientName: 'asafoetida', amount: '', unit: 'pieces', notes: 'pinch (for yogurt sauce)' },
    { ingredientName: 'cumin seeds', amount: '½', unit: 'tbsp', notes: 'for yogurt sauce' },
    { ingredientName: 'cloves', amount: '4', unit: 'pieces', notes: 'for yogurt sauce' },
    { ingredientName: 'onion', amount: '1', unit: 'pieces', notes: 'finely chopped (for yogurt sauce)' },
    { ingredientName: 'plain Greek-style yogurt', amount: '200', unit: 'grams', notes: 'for yogurt sauce' },
    { ingredientName: 'ground coriander', amount: '2', unit: 'tbsp', notes: 'for yogurt sauce' },
    { ingredientName: 'ground turmeric', amount: '½', unit: 'tsp', notes: 'for yogurt sauce' },
    { ingredientName: 'red chilli powder', amount: '½', unit: 'tsp', notes: 'for yogurt sauce' },
    { ingredientName: 'green chillies', amount: '2', unit: 'pieces', notes: 'slit into 4 (for yogurt sauce)' },
    { ingredientName: 'fresh root ginger', amount: '1', unit: 'cm', notes: 'in julienne (for yogurt sauce)' },
    { ingredientName: 'coriander leaves', amount: '20', unit: 'grams', notes: 'chopped (for yogurt sauce)' },
    { ingredientName: 'lemon juice', amount: '', unit: 'pieces', notes: 'juice of ½ lemon (for yogurt sauce)' }
  ],
  'panchmael-daal': [
    { ingredientName: 'ghee', amount: '1', unit: 'tbsp', notes: 'for tadka' },
    { ingredientName: 'dried red chilli', amount: '1', unit: 'pieces', notes: 'for tadka' },
    { ingredientName: 'cumin seeds', amount: '½', unit: 'tsp', notes: 'for tadka' },
    { ingredientName: 'cloves', amount: '4', unit: 'pieces', notes: 'for tadka' },
    { ingredientName: 'garlic cloves', amount: '2', unit: 'pieces', notes: 'finely chopped (for tadka)' }
  ],
  'rezala': [
    { ingredientName: 'royal cumin or black cumin seeds', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'red chilli powder', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground cumin', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'ground garam masala', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'single cream', amount: '100', unit: 'ml', notes: 'to finish' },
    { ingredientName: 'fried cashew nuts', amount: '50', unit: 'grams', notes: 'pounded or blended to a paste (to finish)' },
    { ingredientName: 'coriander leaves', amount: '120', unit: 'grams', notes: 'chopped (to finish)' },
    { ingredientName: 'mint leaves', amount: '20', unit: 'grams', notes: 'chopped (to finish)' }
  ],
  'gucchi-aur-murgh-kalia': [
    { ingredientName: 'ginger paste', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'garlic paste', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'Kashmiri red chilli powder', amount: '2', unit: 'tbsp', notes: '' },
    { ingredientName: 'salt', amount: '2', unit: 'tsp', notes: '' },
    { ingredientName: 'chicken stock', amount: '250', unit: 'ml', notes: '' },
    { ingredientName: 'single cream', amount: '100', unit: 'ml', notes: '' },
    { ingredientName: 'saffron threads', amount: '', unit: 'pieces', notes: 'pinch' },
    { ingredientName: 'ground garam masala', amount: '½', unit: 'tsp', notes: '' },
    { ingredientName: 'rose water', amount: '', unit: 'pieces', notes: 'few drops, optional' },
    { ingredientName: 'gold leaf', amount: '2', unit: 'pieces', notes: 'sheets, completely optional' }
  ]
}

function dedupeIngredients(ings) {
  const seen = new Set()
  const out = []
  for (const ing of ings) {
    const key = `${ing.ingredientName}|${ing.amount}|${ing.notes}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ing)
  }
  return out
}

function toSteps(lines) {
  return lines.map((content, i) => ({ title: `Step ${i + 1}`, content }))
}

async function main() {
  await mkdir(OUTPUT, { recursive: true })
  const index = []

  for (const entry of MANIFEST) {
    const md = await loadPageBody(entry.pages)
    const parsed = extractFromMarkdown(md, entry.title)

    let description = DESCRIPTION_OVERRIDES[entry.slug] || cleanDescription(parsed.description)
    let ingredients
    if (INGREDIENT_OVERRIDES[entry.slug]) {
      ingredients = INGREDIENT_OVERRIDES[entry.slug]
    } else {
      ingredients = dedupeIngredients([
        ...parsed.ingredients.map(cleanIngredient),
        ...(EXTRA_INGREDIENTS[entry.slug] || [])
      ]).filter((ing) => {
        const n = ing.ingredientName.toLowerCase()
        return ing.ingredientName && !/^##?\s/.test(ing.ingredientName) && n !== 'method' && n !== 'ingredients' && !n.startsWith('ingredients ')
      })
    }

    let steps
    if (METHOD_OVERRIDES[entry.slug]) {
      steps = toSteps(METHOD_OVERRIDES[entry.slug])
    } else {
      steps = parsed.steps.map((s, i) => ({
        title: `Step ${i + 1}`,
        content: s.content.replace(/\bI\b/g, '1').replace(/\b14 hours\b/g, '1½ hours').replace(/\b1\/2 tsp\b/g, '½ tsp').trim()
      }))
    }

    const recipe = {
      title: entry.title,
      description,
      tags: ['indian', 'curry', entry.tag],
      source: SOURCE,
      visibility: 'private',
      steps,
      ingredients
    }

    const filename = `${String(entry.num).padStart(3, '0')}-${entry.slug}.json`
    await writeFile(path.join(OUTPUT, filename), `${JSON.stringify(recipe, null, 2)}\n`, 'utf8')
    index.push({
      file: filename,
      title: entry.title,
      ingredients: ingredients.length,
      steps: steps.length
    })
    console.log(`Wrote ${filename} (${ingredients.length} ing, ${steps.length} steps)`)
  }

  await writeFile(
    path.join(OUTPUT, 'index.json'),
    `${JSON.stringify({ count: index.length, bookSource: SOURCE, batch: 'run5', recipes: index }, null, 2)}\n`,
    'utf8'
  )

  const carryForwards = {
    notes: 'Referenced sub-recipes not included in this batch — carry forward from other pages.',
    items: [
      { name: 'Dhalpurie Roti', page: 311, referencedBy: '010-trinidadian-roti.json' },
      { name: 'Dashi', page: 337, referencedBy: '021-curry-nanban-soba.json' },
      { name: 'Mixed pickling spices', page: 24, referencedBy: '028-achari-khargosh.json' },
      { name: 'Layered paratha dough', page: 62, referencedBy: '040-rezala.json' },
      { name: 'Japanese curry roux mix', page: 336, referencedBy: '022-curry-rice.json, 023-katsu-curry.json', optional: true }
    ]
  }
  await writeFile(path.join(OUTPUT, 'carry-forwards.json'), `${JSON.stringify(carryForwards, null, 2)}\n`, 'utf8')

  console.log(`\nTotal: ${index.length} recipes + index.json + carry-forwards.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
