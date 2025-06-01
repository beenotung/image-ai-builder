import { Knex } from 'knex'

// prettier-ignore
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('image_label'))) {
    await knex.schema.createTable('image_label', table => {
      table.increments('id')
      table.integer('image_id').unsigned().notNullable().references('image.id')
      table.integer('label_id').unsigned().notNullable().references('label.id')
      table.integer('user_id').unsigned().notNullable().references('user.id')
      table.integer('answer').notNullable()
      table.timestamps(false, true)
    })
  }
}

// prettier-ignore
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('image_label')
}
