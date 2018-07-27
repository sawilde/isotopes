/*
 * Copyright (c) 2018 Martin Donath <martin.donath@squidfunk.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import { SimpleDB } from "aws-sdk"
import { toPairs } from "lodash"

import { IsotopeDictionary } from "../format"

/* ----------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

/**
 * Isotope client options
 */
export interface IsotopeClientOptions {
  consistent: boolean                  /* Whether to use consistent reads */
}

/**
 * Isotope client item
 */
export interface IsotopeClientItem {
  id: string,                          /* Item identifier */
  attrs: IsotopeDictionary             /* Item attributes */
}

/**
 * Isotope client item list
 */
export interface IsotopeClientItemList {
  items: IsotopeClientItem[]           /* Item list */
  next?: string                        /* Pagination token */
}

/* ----------------------------------------------------------------------------
 * Values
 * ------------------------------------------------------------------------- */

/**
 * Default client options
 */
const defaultOptions: IsotopeClientOptions = {
  consistent: false
}

/* ----------------------------------------------------------------------------
 * Class
 * ------------------------------------------------------------------------- */

/**
 * Isotope SimpleDB client abstraction
 */
export class IsotopeClient {

  /**
   * SimpleDB instance
   */
  protected simpledb: SimpleDB

  /**
   * Create a SimpleDB client
   *
   * @param domain - SimpleDB domain name
   * @param options - Client options
   */
  public constructor(
    protected domain: string,
    protected options: IsotopeClientOptions = defaultOptions
  ) {
    this.simpledb = new SimpleDB({ apiVersion: "2009-04-15" })
  }

  /**
   * Retrieve an item from SimpleDB
   *
   * @param id - Identifier
   * @param names - Attribute names
   *
   * @return Promise resolving with item or undefined
   */
  public async get(
    id: string, names?: string[]
  ): Promise<IsotopeClientItem | undefined> {
    const { Attributes } = await this.simpledb.getAttributes({
      DomainName: this.domain,
      ItemName: id,
      AttributeNames: names,
      ConsistentRead: this.options.consistent
    }).promise()

    /* Item not found */
    if (!Attributes)
      return undefined

    /* Map identifier and attributes */
    return {
      id,
      attrs: Attributes
        .reduce<IsotopeDictionary>((attrs, { Name, Value }) => ({
          ...attrs, [Name]: Value
        }), {})
    }
  }

  /**
   * Persist an item in SimpleDB
   *
   * @param id - Identifier
   * @param attrs - Attributes
   *
   * @return Promise resolving with no result
   */
  public async put(
    id: string, attrs: IsotopeDictionary
  ): Promise<void> {
    await this.simpledb.putAttributes({
      DomainName: this.domain,
      ItemName: id,
      Attributes: toPairs(attrs)
        .map<SimpleDB.Attribute>(([key, value]) => ({
          Name: key,
          Value: value,
          Replace: true
        }))
    }).promise()
  }

  /**
   * Delete an item or specific attributes from SimpleDB
   *
   * @param id - Identifier
   * @param names - Attribute names
   *
   * @return Promise resolving with no result
   */
  public async delete(
    id: string, names?: string[]
  ): Promise<void> {
    await this.simpledb.deleteAttributes({
      DomainName: this.domain,
      ItemName: id,
      Attributes: (names || [])
        .map<SimpleDB.DeletableAttribute>(name => ({
          Name: name
        }))
    }).promise()
  }

  /**
   * Retrieve a set of items matching the given SQL query
   *
   * @param expr - SQL query expression
   * @param next - Token for pagination
   *
   * @return Promise resolving with item list
   */
  public async select(
    expr: string, next?: string
  ): Promise<IsotopeClientItemList> {
    const { Items, NextToken } = await this.simpledb.select({
      SelectExpression: expr,
      NextToken: next,
      ConsistentRead: this.options.consistent
    }).promise()

    /* No items found */
    if (!Items)
      return {
        items: []
      }

    /* Map identifiers and attributes for each item */
    return {
      items: Items.map<IsotopeClientItem>(({ Name: id, Attributes }) => ({
        id,
        attrs: Attributes
          .reduce<IsotopeDictionary>((attrs, { Name, Value }) => ({
            ...attrs, [Name]: Value
          }), {})
      })),
      next: NextToken
    }
  }
}
