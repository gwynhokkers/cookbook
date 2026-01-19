import { db, schema } from '../db'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  // Recipe migration logic
  // @ts-expect-error - hub:blob is a virtual import resolved by Nitro
  const { blob } = await import('hub:blob')
  
  // Simple auth check - in production, use proper authentication
  const authHeader = event.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.MIGRATION_SECRET || 'migration-secret'}`) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const recipesDir = join(process.cwd(), 'content', 'recipes')
  const publicImagesDir = join(process.cwd(), 'public', 'img', 'recipes')
  
  try {
    const files = await readdir(recipesDir)
    const markdownFiles = files.filter(f => f.endsWith('.md'))
    
    const results = []

    for (const file of markdownFiles) {
      try {
        const filePath = join(recipesDir, file)
        const content = await readFile(filePath, 'utf-8')
        const { data: frontmatter, content: body } = matter(content)

        // Extract description (text before <!--more-->)
        const descriptionMatch = body.match(/^(.*?)<!--more-->/s)
        const description = descriptionMatch ? descriptionMatch[1].trim() : body.split('\n\n')[0].trim()

        // Parse ingredients from ::recipe-ingredient-list
        const ingredientMatch = body.match(/::recipe-ingredient-list\s*\n(.*?)\n::/s)
        const ingredients: string[] = []
        if (ingredientMatch) {
          const ingredientText = ingredientMatch[1]
          // Handle both simple list format and YAML format
          if (ingredientText.includes('items:')) {
            // YAML format - extract from items array
            const yamlMatch = ingredientText.match(/items:\s*"\[(.*?)\]"/s)
            if (yamlMatch) {
              try {
                const items = JSON.parse(`[${yamlMatch[1]}]`)
                ingredients.push(...items.map((item: any) => {
                  if (typeof item === 'string') return item
                  return `${item.amount || ''} ${item.measurement || ''} ${item.name || ''}`.trim()
                }))
              } catch (e) {
                // Fallback to simple parsing
                ingredientText.split('\n').forEach(line => {
                  const trimmed = line.trim()
                  if (trimmed && trimmed.startsWith('-')) {
                    ingredients.push(trimmed.substring(1).trim())
                  }
                })
              }
            }
          } else {
            // Simple list format
            ingredientText.split('\n').forEach(line => {
              const trimmed = line.trim()
              if (trimmed && trimmed.startsWith('-')) {
                ingredients.push(trimmed.substring(1).trim())
              }
            })
          }
        }

        // Parse steps from ::recipe-step
        const steps: Array<{ title: string; content: string }> = []
        const stepRegex = /::recipe-step\{title="([^"]+)"\}\s*\n(.*?)\n::/gs
        let stepMatch
        while ((stepMatch = stepRegex.exec(body)) !== null) {
          steps.push({
            title: stepMatch[1],
            content: stepMatch[2].trim()
          })
        }

        // Upload image if exists
        let imageUrl = null
        if (frontmatter.image) {
          try {
            const imagePath = join(publicImagesDir, frontmatter.image)
            const imageBuffer = await readFile(imagePath)
            
            const timestamp = Date.now()
            const extension = frontmatter.image.split('.').pop() || 'jpg'
            const filename = `recipes/${timestamp}-${nanoid()}.${extension}`
            
            const uploaded = await blob.put(filename, imageBuffer, {
              access: 'public',
              contentType: `image/${extension === 'jpg' ? 'jpeg' : extension}`
            })
            
            imageUrl = uploaded.url
          } catch (error) {
            console.error(`Failed to upload image ${frontmatter.image}:`, error)
          }
        }

        // Create recipe in database
        const recipeId = nanoid()
        const recipeDate = frontmatter.date ? new Date(frontmatter.date) : new Date()
        const now = new Date()

        const recipe = {
          id: recipeId,
          title: frontmatter.title,
          description: description || null,
          imageUrl: imageUrl,
          date: recipeDate,
          tags: frontmatter.tags || [],
          source: frontmatter.source || null,
          ingredients: ingredients,
          steps: steps,
          authorId: null, // No author for migrated recipes
          createdAt: now,
          updatedAt: now
        }

        await db.insert(schema.recipes).values(recipe)
        
        results.push({
          file,
          success: true,
          recipeId
        })
      } catch (error: any) {
        results.push({
          file,
          success: false,
          error: error.message
        })
      }
    }

    return {
      success: true,
      migrated: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Migration failed: ${error.message}`
    })
  }
})
